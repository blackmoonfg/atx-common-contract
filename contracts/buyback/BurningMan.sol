pragma solidity ^0.4.18;


import "bmc-contract/contracts/core/common/Object.sol";
import "bmc-contract/contracts/core/lib/SafeMath.sol";
import "bmc-contract/contracts/core/platform/BMCAssetProxy.sol";
import "bmc-contract/contracts/core/platform/BMCPlatformInterface.sol";
import "bmc-contract/contracts/atx/asset/ATxAssetProxyInterface.sol";
import "bmc-contract/contracts/atx/asset/ServiceAllowance.sol";
import "../distribution/Profiterole.sol";
import "./BurningManInterface.sol";


/// @title BurningMan
///
/// Base implementation
/// This contract serves as services for buyback ATx tokens to ether.
/// Full functionality of BurningMan finalisation will be available after adding a smart contract
/// as part-owner of an ATx asset in asset's platform
contract BurningMan is Object, BurningManInterface, ServiceAllowance {

    uint constant BURNING_MAN_ERROR_SCOPE = 104000;
    uint constant BURNING_MAN_ERROR_INSUFFICIENT_FUNDS = BURNING_MAN_ERROR_SCOPE + 1;
    uint constant BURNING_MAN_ERROR_NOT_ENOUGH_ALLOWANCE = BURNING_MAN_ERROR_SCOPE + 2;
    uint constant BURNING_MAN_ERROR_WHILE_TOKEN_TRANSFER = BURNING_MAN_ERROR_SCOPE + 3;
    uint constant BURNING_MAN_ERROR_WRONG_STATE = BURNING_MAN_ERROR_SCOPE + 4;
    uint constant BURNING_MAN_ERROR_INSUFFICIENT_BONUS_TOKEN_FUNDS = BURNING_MAN_ERROR_SCOPE + 5;
    uint constant BURNING_MAN_ERROR_PRICE_IS_NOT_INITIALIZED = BURNING_MAN_ERROR_SCOPE + 6;

    using SafeMath for uint;

    enum State {
        Waiting,
        Running,
        BeforeFinalization,
        Finalized
    }

    struct FeeData {
        uint feeValue;
        uint feeDecimals;
    }

    struct Account {
        uint atxBalance;
        uint ethBalance;
        FeeData srdFee;
    }

    address public proxy;
    address public profiterole;
    address public bonusToken;

    uint public startDate;
    uint public endDate;

    uint public maxBuybackAmount;
    uint public totalBuybackAmount = 0;

    uint public price;
    FeeData public rdFee;

    uint public accountsCount;
    mapping(address => uint) account2Index;
    mapping(uint => Account) index2AccountBalance;

    bool active = true;

    /// @dev Execution is allowed only not in buyback period
    modifier onlyRun {
        if (getState() != State.Running) {
            assembly {
                mstore(0, 104004) // BURNING_MAN_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Execution is allowed only after buyback period
    modifier onlyAfterRun {
        if (getState() != State.BeforeFinalization) {
            assembly {
                mstore(0, 104004) // BURNING_MAN_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Execution is allowed only before buyback period
    modifier onlyBeforeBuyback {
        if (getState() == State.Finalized) {
            assembly {
                mstore(0, 104004) // BURNING_MAN_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Execution is allowed only on last stage of buyback period
    modifier onlyFinalized {
        if (active) {// note: optimized for not using `State` type
            assembly {
                mstore(0, 104004) // BURNING_MAN_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @notice Default BurningMan's constructor.
    ///
    /// @param _profiterole Harvester wallet address.
    /// @param _proxy ERC20 Proxy address.
    /// @param _startDate start date for buyback.
    /// @param _endDate end date for buyback.
    /// @param _rdFee fee price for buyback.
    /// @param _rdFeeDecimals fee decimals.
    /// @param _price price in Eth for 1 ATx token.
    /// @param _maxBuybackAmount max token amount, which can be burn at once.
    function BurningMan(
        address _proxy,
        address _bonusToken,
        address _profiterole,
        uint _startDate,
        uint _endDate,
        uint _rdFee,
        uint _rdFeeDecimals,
        uint _price,
        uint _maxBuybackAmount
    )
    public
    {
        require(_proxy != 0x0);
        require(_bonusToken != 0x0);
        require(_profiterole != 0x0);
        require(_startDate >= now);
        require(_endDate > _startDate);
        require(_validFee(_rdFee, _rdFeeDecimals));
        require(_price != 0);
        require(_maxBuybackAmount != 0);

        require(Profiterole(_profiterole).bonusToken() == _bonusToken);

        proxy = _proxy;
        bonusToken = _bonusToken;
        profiterole = _profiterole;

        startDate = _startDate;
        endDate = _endDate;
        rdFee = FeeData(_rdFee, _rdFeeDecimals);
        price = _price;
        maxBuybackAmount = _maxBuybackAmount;
    }

    /// @notice Receive ether
    /// On success send event with information about it (from, amount of ether)
    function() payable public {
        EthReceived(msg.sender, msg.value);
    }

    /// @notice Gets current state of BurningMan. State changes over time or reaching buyback goals.
    ///
    /// @return state of a BurningMan. `Waiting`, `Running`, `BeforeFinalization`, `Finalized` values are possible
    function getState() public view returns (State) {
        if (now < startDate) {
            return State.Waiting;
        }

        var (_active, _endDate, _totalBuybackAmount, _maxBuybackAmount) = (active, endDate, totalBuybackAmount, maxBuybackAmount);
        if ((now > startDate && now < _endDate) && _totalBuybackAmount != _maxBuybackAmount && _active) {
            return State.Running;
        } else if ((now >= _endDate || _totalBuybackAmount == _maxBuybackAmount) && _active) {
            return State.BeforeFinalization;
        }

        if (!_active) {
            return State.Finalized;
        }

        assert(false);
    }

    /// @notice Set price (ETHs for 1 ATx)
    /// Can be called only before buyback period and only by contract owner
    ///
    /// @param _price price for token (in wei).
    ///
    /// @return code.
    function setPrice(uint _price) public onlyContractOwner onlyAfterRun returns (uint) {
        require(_price != 0);
        price = _price;
        return OK;
    }

    /// @notice Get custom fee for specific account
    ///
    /// @param _account account address.
    ///
    /// @return fee, decimals.
    function getSpecialRdFee(address _account) public view returns (uint, uint) {
        uint _index = account2Index[_account];
        return (index2AccountBalance[_index].srdFee.feeValue, index2AccountBalance[_index].srdFee.feeDecimals);
    }

    /// @notice Gets an amount of Ether which can be withdraw from the contract
    ///
    /// @return amount of Ether.
    function getAvailableToWithdrawEth() public view returns (uint _balance) {
        uint _index = account2Index[msg.sender];
        _balance = index2AccountBalance[_index].ethBalance;

        if (_balance != 0) {
            return _balance;
        }

        var (_atxBalance, _fee) = _calculateFeeAmount(index2AccountBalance[_index]);

        if (_atxBalance != 0) {
            _balance = (_atxBalance.sub(_fee)).mul(price);
        }
    }

    /// @notice Gets an estimation of total Ether that will be available for withdrawal for stored ATx tokens
    /// provided by users. That amout of Ether should be on BurningMan's account after finilizing the buyback period.
    ///
    /// @return _sum an amount of Ether needed to be transferred to BurningMan address
    function getEstimatedToDepositEth() public view returns (uint _sum) {
        uint _price = price;
        uint _accountsCount = accountsCount;
        for (uint i = 1; i <= _accountsCount; ++i) {
            Account storage _accountData = index2AccountBalance[i];
            var (_atxBalance, _amount) = _calculateFeeAmount(_accountData);
            if (_atxBalance == 0) {
                _sum = _sum.add(_accountData.ethBalance);
            } else {
                _sum = _sum.add((_atxBalance.sub(_amount)).mul(_price));
            }
        }
    }

    /// @notice Gets an estimated amount of share tokens that is needed to be deposited for redemption fee distribution.
    /// Should be provided before buyback finalization.
    ///
    /// @return _sum an amount of tokens needed to be transferred to BurningMan address
    function getEstimatedRdFeeAmount() public view returns (uint _sum) {
        uint _accountsCount = accountsCount;
        for (uint i = 1; i <= _accountsCount; ++i) {
            var (, _amount) = _calculateFeeAmount(index2AccountBalance[i]);
            _sum = _sum.add(_amount);
        }
    }

    /// @notice Set custom fee for specific account
    /// Can be called only before buyback period and only by contract owner
    ///
    /// @param _account account address.
    /// @param _rdFee fee.
    ///
    /// @return code.
    function setSpecialRdFee(
        address _account, 
        uint _rdFee, 
        uint _rdFeeDecimals
    ) 
    onlyContractOwner 
    onlyBeforeBuyback 
    public 
    returns (uint) 
    {
        require(_validFee(_rdFee, _rdFeeDecimals));
        uint _index = _createAccountIndex(_account);
        index2AccountBalance[_index].srdFee = FeeData(_rdFee, _rdFeeDecimals);
        return OK;
    }

    /// @notice Reset special redemption fee so the default redemption fee value will be used instead
    ///
    /// @param _account user address that loose his special redemption fee
    ///
    /// @return result code of an operation
    function resetSpecialRdFee(
        address _account
    ) 
    onlyContractOwner 
    onlyBeforeBuyback 
    public 
    returns (uint) 
    {
        uint _index = _createAccountIndex(_account);
        delete index2AccountBalance[_index].srdFee;
        return OK;
    }

    /// @notice Burn some amount of tokens: take an _amount of ATx token from sender's account and add a record in ledger.
    /// Later user could withdraw Ether that was exchanged for transferred tokens.
    /// Can be called only in buyback period.
    ///
    /// @param _amount token amount
    ///
    /// @return result code of an operation
    function registerSell(uint _amount) public onlyRun returns (uint) {
        require(_amount != 0);

        ATxAssetProxyInterface _token = ATxAssetProxyInterface(proxy);
        address _account = msg.sender;

        uint _totalBuybackAmount = totalBuybackAmount;
        uint _maxBuybackAmount = maxBuybackAmount;
        if (_totalBuybackAmount.add(_amount) > _maxBuybackAmount) {
            _amount = _maxBuybackAmount.sub(_totalBuybackAmount);
        }

        if (_token.allowance(_account, address(this)) < _amount) {
            return _emitError(BURNING_MAN_ERROR_NOT_ENOUGH_ALLOWANCE);
        }

        uint _index = _createAccountIndex(_account);
        uint _balance = index2AccountBalance[_index].atxBalance.add(_amount);
        index2AccountBalance[_index].atxBalance = _balance;
        totalBuybackAmount = _totalBuybackAmount.add(_amount);

        if (!_token.transferFrom(_account, address(this), _amount)) {
            revert();
        }

        TokenBurnRequested(_token, _amount, _account);
        return OK;
    }

    /// @notice Revert some amount of tokens, which were send to burn
    /// Can be called only in buyback period
    ///
    /// @param _amount token amount.
    ///
    /// @return code.
    function revertSell(uint _amount) public onlyRun returns (uint) {
        require(_amount != 0);

        ATxAssetProxyInterface _token = ATxAssetProxyInterface(proxy);
        address _account = msg.sender;
        uint _index = account2Index[_account];

        uint _balance = index2AccountBalance[_index].atxBalance;
        if (_balance < _amount) {
            return _emitError(BURNING_MAN_ERROR_INSUFFICIENT_FUNDS);
        }

        index2AccountBalance[_index].atxBalance = _balance.sub(_amount);
        totalBuybackAmount = totalBuybackAmount.sub(_amount);

        if (!_token.transfer(_account, _amount)) {
            revert();
        }

        TokenBurnReverted(_token, _amount, _account);
        return OK;
    }

    /// @notice Finalize buyback period
    /// Can be called only by contract owner and after buyback period
    ///
    /// @return code, account index
    function finalizeBuyback() public onlyContractOwner onlyAfterRun returns (uint _code) {
        if (price == 0) {
            return _emitError(BURNING_MAN_ERROR_PRICE_IS_NOT_INITIALIZED);
        }

        uint _costs = getEstimatedToDepositEth();

        if (address(this).balance < _costs) {
            return _emitError(BURNING_MAN_ERROR_INSUFFICIENT_FUNDS);
        }

        _code = _transferRedemptionFee(getEstimatedRdFeeAmount());
        if (OK != _code) {
            return _emitError(_code);
        }

        ATxAssetProxyInterface _token = ATxAssetProxyInterface(proxy);
        BMCPlatformInterface _platform = BMCPlatformInterface(address(_token.platform()));
        assert(OK == _platform.revokeAsset(_token.smbl(), _token.balanceOf(address(this))));

        active = false;

        BuybackFinalized();
        return OK;
    }

    /// @notice Withdraw ether from contract
    /// Can be called only after buyback period
    ///
    /// @param _amount token amount.
    ///
    /// @return code.
    function withdrawEth(uint _amount) public onlyFinalized returns (uint) {
        require(_amount != 0x0);

        address _account = msg.sender;
        Account storage _accountData = index2AccountBalance[account2Index[_account]];
        uint _balance = getAvailableToWithdrawEth();

        if (_amount > _balance) {
            return BURNING_MAN_ERROR_INSUFFICIENT_FUNDS;
        }

        delete _accountData.atxBalance;
        _accountData.ethBalance = _balance.sub(_amount);
        _account.transfer(_amount);

        EthWithdrawn(_account, _amount);
        return OK;
    }

    /// ServiceAllowance
    ///
    /// @notice ServiceAllowance interface implementation
    /// @dev Should cover conditions for allowance of transfers
    function isTransferAllowed(address, address _to, address, address _token, uint) public view returns (bool) {
        if ((_token == proxy && active) || _to == contractOwner) {
            return true;
        }
    }

    function _createAccountIndex(address _account) private returns (uint _accountIndex) {
        _accountIndex = account2Index[_account];

        if (_accountIndex == 0) {
            _accountIndex = accountsCount.add(1);
            account2Index[_account] = _accountIndex;
            accountsCount = _accountIndex;
        }
    }

    function _transferRedemptionFee(uint _totalFeeAmount) private returns (uint) {
        ERC20Interface _bonusToken = ERC20Interface(bonusToken);
        uint _balance = _bonusToken.balanceOf(address(this));
        if (_balance < _totalFeeAmount) {
            return BURNING_MAN_ERROR_INSUFFICIENT_BONUS_TOKEN_FUNDS;
        }

        Profiterole _profiterole = Profiterole(profiterole);
        if (!_bonusToken.approve(address(_profiterole), _totalFeeAmount)) {
            return BURNING_MAN_ERROR_WHILE_TOKEN_TRANSFER;
        }

        if (OK != _profiterole.distributeBonuses(_totalFeeAmount)) {
            revert();
        }
        return OK;
    }

    function _validFee(uint _value, uint _decimals) private pure returns (bool) {
        return _value != 0 && _value / 10 ** _decimals.sub(1) >= 0 && _value / 10 ** _decimals.sub(1) < 10;
    }

    function _calculateFeeAmount(Account storage _account) private view returns (uint _atxBalance, uint _fee) {
        _atxBalance = _account.atxBalance;
        if (_atxBalance == 0) {
            return (0, 0);
        }

        uint _srdFeeNumber = _account.srdFee.feeValue;
        _fee = _srdFeeNumber != 0
        ? (_atxBalance.mul(_srdFeeNumber) / 10 ** _account.srdFee.feeDecimals)
        : (_atxBalance .mul(rdFee.feeValue) / 10 ** rdFee.feeDecimals);
    }

    function _emitError(uint _errorCode) private returns (uint) {
        Error(_errorCode);
        return _errorCode;
    }
}
