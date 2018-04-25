pragma solidity ^0.4.18;


import "bmc-contract/contracts/core/lib/SafeMath.sol";
import "bmc-contract/contracts/core/erc20/ERC20Interface.sol";
import "bmc-contract/contracts/atx/asset/ServiceAllowance.sol";
import "bmc-contract/contracts/atx/wallet/DepositWalletInterface.sol";
import "bmc-contract/contracts/atx/oracle/OracleAdapter.sol";
import "./ProfiteroleEmitter.sol";
import "./Treasury.sol";


/// @title Profiterole contract
/// Collector and distributor for creation and redemption fees.
/// Accepts bonus tokens from EmissionProvider, BurningMan or other distribution source.
/// Calculates CCs shares in bonuses. Uses Treasury Contract as source of shares in bmc-days.
/// Allows to withdraw bonuses on request.
contract Profiterole is OracleAdapter, ServiceAllowance, ProfiteroleEmitter {

    uint constant PERCENT_PRECISION = 10000;

    uint constant PROFITEROLE_ERROR_SCOPE = 102000;
    uint constant PROFITEROLE_ERROR_INSUFFICIENT_DISTRIBUTION_BALANCE = PROFITEROLE_ERROR_SCOPE + 1;
    uint constant PROFITEROLE_ERROR_INSUFFICIENT_BONUS_BALANCE = PROFITEROLE_ERROR_SCOPE + 2;
    uint constant PROFITEROLE_ERROR_TRANSFER_ERROR = PROFITEROLE_ERROR_SCOPE + 3;

    using SafeMath for uint;

    struct Balance {
        uint left;
        bool initialized;
    }

    struct Deposit {
        uint balance;
        uint left;
        uint nextDepositDate;
        mapping(bytes32 => Balance) leftToWithdraw;
    }

    struct UserBalance {
        uint lastWithdrawDate;
    }

    mapping(address => bool) distributionSourcesList;
    mapping(bytes32 => UserBalance) bonusBalances;
    mapping(uint => Deposit) public distributionDeposits;

    uint public firstDepositDate;
    uint public lastDepositDate;

    address public bonusToken;
    address public treasury;
    address public wallet;

    /// @dev Guards functions only for distributionSource invocations
    modifier onlyDistributionSource {
        if (!distributionSourcesList[msg.sender]) {
            revert();
        }
        _;
    }

    function Profiterole(address _bonusToken, address _treasury, address _wallet) public {
        require(_bonusToken != 0x0);
        require(_treasury != 0x0);
        require(_wallet != 0x0);

        bonusToken = _bonusToken;
        treasury = _treasury;
        wallet = _wallet;
    }

    function() payable public {
        revert();
    }

    /* EXTERNAL */

    /// @notice Sets new treasury address
    /// Only for contract owner.
    function updateTreasury(address _treasury) external onlyContractOwner returns (uint) {
        require(_treasury != 0x0);
        treasury = _treasury;
        return OK;
    }

    /// @notice Sets new wallet address for profiterole
    /// Only for contract owner.
    function updateWallet(address _wallet) external onlyContractOwner returns (uint) {
        require(_wallet != 0x0);
        wallet = _wallet;
        return OK;
    }

    /// @notice Add distribution sources to whitelist.
    ///
    /// @param _whitelist addresses list.
    function addDistributionSources(address[] _whitelist) external onlyContractOwner returns (uint) {
        for (uint _idx = 0; _idx < _whitelist.length; ++_idx) {
            distributionSourcesList[_whitelist[_idx]] = true;
        }
        return OK;
    }

    /// @notice Removes distribution sources from whitelist.
    /// Only for contract owner.
    ///
    /// @param _blacklist addresses in whitelist.
    function removeDistributionSources(address[] _blacklist) external onlyContractOwner returns (uint) {
        for (uint _idx = 0; _idx < _blacklist.length; ++_idx) {
            delete distributionSourcesList[_blacklist[_idx]];
        }
        return OK;
    }

    /// @notice Allows to withdraw user's bonuses that he deserves due to Treasury shares for
    /// every distribution period.
    /// Only oracles allowed to invoke this function.
    ///
    /// @param _userKey aggregated user key (user ID + role ID) on behalf of whom bonuses will be withdrawn
    /// @param _value an amount of tokens to withdraw
    /// @param _withdrawAddress destination address of withdrawal (usually user's address)
    /// @param _feeAmount an amount of fee that will be taken from resulted _value
    /// @param _feeAddress destination address of fee transfer
    ///
    /// @return result code of an operation
    function withdrawBonuses(bytes32 _userKey, uint _value, address _withdrawAddress, uint _feeAmount, address _feeAddress) external onlyOracle returns (uint) {
        require(_userKey != bytes32(0));
        require(_value != 0);
        require(_feeAmount < _value);
        require(_withdrawAddress != 0x0);

        DepositWalletInterface _wallet = DepositWalletInterface(wallet);
        ERC20Interface _bonusToken = ERC20Interface(bonusToken);
        if (_bonusToken.balanceOf(_wallet) < _value) {
            return _emitError(PROFITEROLE_ERROR_INSUFFICIENT_BONUS_BALANCE);
        }

        if (OK != _withdrawBonuses(_userKey, _value)) {
            revert();
        }

        if (!(_feeAddress == 0x0 || _feeAmount == 0 || OK == _wallet.withdraw(_bonusToken, _feeAddress, _feeAmount))) {
            revert();
        }

        if (OK != _wallet.withdraw(_bonusToken, _withdrawAddress, _value - _feeAmount)) {
            revert();
        }

        BonusesWithdrawn(_userKey, _value, now);
        return OK;
    }

    /* PUBLIC */

    /// @notice Gets total amount of bonuses user has during all distribution periods
    /// @param _userKey aggregated user key (user ID + role ID)
    /// @return _sum available amount of bonuses to withdraw
    function getTotalBonusesAmountAvailable(bytes32 _userKey) public view returns (uint _sum) {
        uint _startDate = _getCalculationStartDate(_userKey);
        Treasury _treasury = Treasury(treasury);

        for (
            uint _endDate = lastDepositDate;
            _startDate <= _endDate && _startDate != 0;
            _startDate = distributionDeposits[_startDate].nextDepositDate
        ) {
            Deposit storage _pendingDeposit = distributionDeposits[_startDate];
            Balance storage _userBalance = _pendingDeposit.leftToWithdraw[_userKey];

            if (_userBalance.initialized) {
                _sum = _sum.add(_userBalance.left);
            } else {
                uint _sharesPercent = _treasury.getSharesPercentForPeriod(_userKey, _startDate);
                _sum = _sum.add(_pendingDeposit.balance.mul(_sharesPercent).div(PERCENT_PRECISION));
            }
        }
    }

    /// @notice Gets an amount of bonuses user has for concrete distribution date
    /// @param _userKey aggregated user key (user ID + role ID)
    /// @param _distributionDate date of distribution operation
    /// @return available amount of bonuses to withdraw for selected distribution date
    function getBonusesAmountAvailable(bytes32 _userKey, uint _distributionDate) public view returns (uint) {
        Deposit storage _deposit = distributionDeposits[_distributionDate];
        if (_deposit.leftToWithdraw[_userKey].initialized) {
            return _deposit.leftToWithdraw[_userKey].left;
        }

        uint _sharesPercent = Treasury(treasury).getSharesPercentForPeriod(_userKey, _distributionDate);
        return _deposit.balance.mul(_sharesPercent).div(PERCENT_PRECISION);
    }

    /// @notice Gets total amount of deposits that has left after users' bonus withdrawals
    /// @return amount of deposits available for bonus payments
    function getTotalDepositsAmountLeft() public view returns (uint _amount) {
        uint _lastDepositDate = lastDepositDate;
        for (
            uint _startDate = firstDepositDate;
            _startDate <= _lastDepositDate || _startDate != 0;
            _startDate = distributionDeposits[_startDate].nextDepositDate
        ) {
            _amount = _amount.add(distributionDeposits[_startDate].left);
        }
    }

    /// @notice Gets an amount of deposits that has left after users' bonus withdrawals for selected date
    /// @param _distributionDate date of distribution operation
    /// @return amount of deposits available for bonus payments for concrete distribution date
    function getDepositsAmountLeft(uint _distributionDate) public view returns (uint _amount) {
        return distributionDeposits[_distributionDate].left;
    }

    /// @notice Makes checkmark and deposits tokens on profiterole account
    /// to pay them later as bonuses for Treasury shares holders. Timestamp of transaction
    /// counts as the distribution period date.
    /// Only addresses that were added as a distributionSource are allowed to call this function.
    ///
    /// @param _amount an amount of tokens to distribute
    ///
    /// @return result code of an operation.
    /// PROFITEROLE_ERROR_INSUFFICIENT_DISTRIBUTION_BALANCE, PROFITEROLE_ERROR_TRANSFER_ERROR errors
    /// are possible
    function distributeBonuses(uint _amount) public onlyDistributionSource returns (uint) {

        ERC20Interface _bonusToken = ERC20Interface(bonusToken);

        if (_bonusToken.allowance(msg.sender, address(this)) < _amount) {
            return _emitError(PROFITEROLE_ERROR_INSUFFICIENT_DISTRIBUTION_BALANCE);
        }

        if (!_bonusToken.transferFrom(msg.sender, wallet, _amount)) {
            return _emitError(PROFITEROLE_ERROR_TRANSFER_ERROR);
        }

        if (firstDepositDate == 0) {
            firstDepositDate = now;
        }

        uint _lastDepositDate = lastDepositDate;
        if (_lastDepositDate != 0) {
            distributionDeposits[_lastDepositDate].nextDepositDate = now;
        }

        lastDepositDate = now;
        distributionDeposits[now] = Deposit(_amount, _amount, 0);

        Treasury(treasury).addDistributionPeriod();

        DepositPendingAdded(_amount, msg.sender, now);
        return OK;
    }

    function isTransferAllowed(address, address, address, address, uint) public view returns (bool) {
        return false;
    }

    /* PRIVATE */

    function _getCalculationStartDate(bytes32 _userKey) private view returns (uint _startDate) {
        _startDate = bonusBalances[_userKey].lastWithdrawDate;
        return _startDate != 0 ? _startDate : firstDepositDate;
    }

    function _withdrawBonuses(bytes32 _userKey, uint _value) private returns (uint) {
        uint _startDate = _getCalculationStartDate(_userKey);
        uint _lastWithdrawDate = _startDate;
        Treasury _treasury = Treasury(treasury);

        for (
            uint _endDate = lastDepositDate;
            _startDate <= _endDate && _startDate != 0 && _value > 0;
            _startDate = distributionDeposits[_startDate].nextDepositDate
        ) {
            uint _balanceToWithdraw = _withdrawBonusesFromDeposit(_userKey, _startDate, _value, _treasury);
            _value = _value.sub(_balanceToWithdraw);
        }

        if (_lastWithdrawDate != _startDate) {
            bonusBalances[_userKey].lastWithdrawDate = _lastWithdrawDate;
        }

        if (_value > 0) {
            revert();
        }

        return OK;
    }

    function _withdrawBonusesFromDeposit(bytes32 _userKey, uint _periodDate, uint _value, Treasury _treasury) private returns (uint) {
        Deposit storage _pendingDeposit = distributionDeposits[_periodDate];
        Balance storage _userBalance = _pendingDeposit.leftToWithdraw[_userKey];

        uint _balanceToWithdraw;
        if (_userBalance.initialized) {
            _balanceToWithdraw = _userBalance.left;
        } else {
            uint _sharesPercent = _treasury.getSharesPercentForPeriod(_userKey, _periodDate);
            _balanceToWithdraw = _pendingDeposit.balance.mul(_sharesPercent).div(PERCENT_PRECISION);
            _userBalance.initialized = true;
        }

        if (_balanceToWithdraw > _value) {
            _userBalance.left = _balanceToWithdraw - _value;
            _balanceToWithdraw = _value;
        } else {
            delete _userBalance.left;
        }

        _pendingDeposit.left = _pendingDeposit.left.sub(_balanceToWithdraw);
        return _balanceToWithdraw;
    }
}
