pragma solidity ^0.4.11;

import "bmc-contract/contracts/core/common/Object.sol";
import "bmc-contract/contracts/core/lib/SafeMath.sol";
import "bmc-contract/contracts/core/erc20/ERC20Interface.sol";
import "bmc-contract/contracts/atx/oracle/OracleAdapter.sol";
import "bmc-contract/contracts/atx/asset/ServiceAllowance.sol";
import {ATxAssetProxyInterface as Token} from "bmc-contract/contracts/atx/asset/ATxAssetProxyInterface.sol";
import {ATxPlatformInterface as Platform} from "bmc-contract/contracts/atx/asset/ATxPlatformInterface.sol";
import "../distribution/Profiterole.sol";
import "./EmissionProviderEmitter.sol";

/// @title EmissionProvider.
///
/// Provides participation registration and token volume issuance called Emission Event.
/// Full functionality of EmissionProvider issuance will be available after adding a smart contract
/// as part-owner of an ATx asset in asset's platform
contract EmissionProvider is OracleAdapter, ServiceAllowance, EmissionProviderEmitter {

    uint constant EMISSION_PROVIDER_ERROR_SCOPE = 107000;
    uint constant EMISSION_PROVIDER_ERROR_WRONG_STATE = EMISSION_PROVIDER_ERROR_SCOPE + 1;
    uint constant EMISSION_PROVIDER_ERROR_INSUFFICIENT_BMC = EMISSION_PROVIDER_ERROR_SCOPE + 2;
    uint constant EMISSION_PROVIDER_ERROR_INTERNAL = EMISSION_PROVIDER_ERROR_SCOPE + 3;

    using SafeMath for uint;

    enum State {
        Init, Waiting, Sale, Reached, Destructed
    }

    uint public startDate;
    uint public endDate;

    uint public tokenSoftcapIssued;
    uint public tokenSoftcap;

    uint tokenHardcapIssuedValue;
    uint tokenHardcapValue;

    address public token;
    address public bonusToken;
    address public profiterole;

    mapping(address => bool) public whitelist;

    bool public destructed;
    bool finishedHardcap;
    bool needInitialization;

    /// @dev Deny any access except during sale period (it's time for sale && hardcap haven't reached yet)
    modifier onlySale {
        var (hardcapState, softcapState) = getState();
        if (!(State.Sale == hardcapState || State.Sale == softcapState)) {
            _emitError(EMISSION_PROVIDER_ERROR_WRONG_STATE);
            assembly {
                mstore(0, 107001) // EMISSION_PROVIDER_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Deny any access before all sales will be finished
    modifier onlySaleFinished {
        var (hardcapState, softcapState) = getState();
        if (hardcapState < State.Reached || softcapState < State.Reached) {
            _emitError(EMISSION_PROVIDER_ERROR_WRONG_STATE);
            assembly {
                mstore(0, 107001) // EMISSION_PROVIDER_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }
    /// @dev Deny any access before hardcap will be reached
    modifier notHardcapReached {
        var (state,) = getState();
        if (state >= State.Reached) {
            _emitError(EMISSION_PROVIDER_ERROR_WRONG_STATE);
            assembly {
                mstore(0, 107001) // EMISSION_PROVIDER_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Deny any access before softcap will be reached
    modifier notSoftcapReached {
        var (, state) = getState();
        if (state >= State.Reached) {
            _emitError(EMISSION_PROVIDER_ERROR_WRONG_STATE);
            assembly {
                mstore(0, 107001) // EMISSION_PROVIDER_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Guards from calls to the contract in destructed state
    modifier notDestructed {
        if (destructed) {
            _emitError(EMISSION_PROVIDER_ERROR_WRONG_STATE);
            assembly {
                mstore(0, 107001) // EMISSION_PROVIDER_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Deny any access except the contract is not in init state
    modifier onlyInit {
        var (state,) = getState();
        if (state != State.Init) {
            _emitError(EMISSION_PROVIDER_ERROR_WRONG_STATE);
            assembly {
                mstore(0, 107001) // EMISSION_PROVIDER_ERROR_WRONG_STATE
                return (0, 32)
            }
        }
        _;
    }

    /// @dev Allow access only for whitelisted users
    modifier onlyAllowed(address _account) {
        if (whitelist[_account]) {
            _;
        }
    }

    /// @notice Constructor for EmissionProvider.
    ///
    /// @param _token token that will be served by EmissionProvider
    /// @param _bonusToken shares token used for fee distribution
    /// @param _profiterole address of fee destination
    /// @param _startDate start date of emission event
    /// @param _endDate end date of emission event
    /// @param _tokenHardcap max amount of tokens that are allowed to issue. After reaching this number emission will be stopped.
    function EmissionProvider(
        address _token,
        address _bonusToken,
        address _profiterole,
        uint _startDate,
        uint _endDate,
        uint _tokenSoftcap,
        uint _tokenHardcap
    )
    public
    {
        require(_token != 0x0);
        require(_bonusToken != 0x0);

        require(_profiterole != 0x0);

        require(_startDate != 0);
        require(_endDate > _startDate);

        require(_tokenSoftcap != 0);
        require(_tokenHardcap >= _tokenSoftcap);

        require(Profiterole(_profiterole).bonusToken() == _bonusToken);

        token = _token;
        bonusToken = _bonusToken;
        profiterole = _profiterole;
        startDate = _startDate;
        endDate = _endDate;
        tokenSoftcap = _tokenSoftcap;
        tokenHardcapValue = _tokenHardcap - _tokenSoftcap;
        needInitialization = true;
    }

    /// @dev Payable function. Don't accept any Ether
    function() public payable {
        revert();
    }

    /// @notice Initialization
    /// Issue new ATx tokens for Softcap. After contract goes in Sale state
    function init() public onlyContractOwner onlyInit returns (uint) {
        needInitialization = false;
        bytes32 _symbol = Token(token).smbl();
        if (OK != Platform(Token(token).platform()).reissueAsset(_symbol, tokenSoftcap)) {
            revert();
        }
        return OK;
    }

    /// @notice Gets absolute hardcap value which means it will be greater than softcap value.
    /// Actual value will be equal to `tokenSoftcap - tokenHardcap`
    function tokenHardcap() public view returns (uint) {
        return tokenSoftcap + tokenHardcapValue;
    }

    /// @notice Gets absolute issued hardcap volume which means it will be greater than softcap value.
    /// Actual value will be equal to `tokenSoftcap - tokenHardcapIssued`
    function tokenHardcapIssued() public view returns (uint) {
        return tokenSoftcap + tokenHardcapIssuedValue;
    }

    /// @notice Gets current state of Emission Provider. State changes over time or reaching buyback goals.
    /// @return state of a Emission Provider. 'Init', 'Waiting', 'Sale', 'HardcapReached', 'Destructed` values are possible
    function getState() public view returns (State, State) {
        if (needInitialization) {
            return (State.Init, State.Init);
        }

        if (destructed) {
            return (State.Destructed, State.Destructed);
        }

        if (now < startDate) {
            return (State.Waiting, State.Waiting);
        }

        State _hardcapState = (finishedHardcap || (tokenHardcapIssuedValue == tokenHardcapValue) || (now > endDate))
        ? State.Reached
        : State.Sale;

        State _softcapState = (tokenSoftcapIssued == tokenSoftcap)
        ? State.Reached
        : State.Sale;

        return (_hardcapState, _softcapState);
    }

    /// @notice Add users to whitelist.
    /// @param _whitelist user list.
    function addUsers(address[] _whitelist) public onlyContractOwner onlySale returns (uint) {
        for (uint _idx = 0; _idx < _whitelist.length; ++_idx) {
            whitelist[_whitelist[_idx]] = true;
        }
        return OK;
    }

    /// @notice Removes users from whitelist.
    /// @param _blacklist user in whitelist.
    function removeUsers(address[] _blacklist) public onlyContractOwner onlySale returns (uint) {
        for (uint _idx = 0; _idx < _blacklist.length; ++_idx) {
            delete whitelist[_blacklist[_idx]];
        }
        return OK;
    }

    /// @notice Issue tokens for user.
    /// Access allowed only for oracle while the sale period is active.
    ///
    /// @param _token address for token.
    /// @param _for user address.
    /// @param _value token amount,
    function issueHardcapToken(
        address _token, 
        address _for, 
        uint _value
    ) 
    onlyOracle 
    onlyAllowed(_for) 
    onlySale 
    notHardcapReached 
    public
    returns (uint) 
    {
        require(_token == token);
        require(_value != 0);

        uint _tokenHardcap = tokenHardcapValue;
        uint _issued = tokenHardcapIssuedValue;
        if (_issued.add(_value) > _tokenHardcap) {
            _value = _tokenHardcap.sub(_issued);
        }

        tokenHardcapIssuedValue = _issued.add(_value);

        bytes32 _symbol = Token(_token).smbl();
        if (OK != Platform(Token(_token).platform()).reissueAsset(_symbol, _value)) {
            revert();
        }

        if (!Token(_token).transfer(_for, _value)) {
            revert();
        }

        _emitEmission(_symbol, _for, _value);
        return OK;
    }

    /// @notice Issue tokens for user.
    /// Access allowed only for oracle while the sale period is active.
    ///
    /// @param _token address for token.
    /// @param _for user address.
    /// @param _value token amount,
    function issueSoftcapToken(
        address _token, 
        address _for, 
        uint _value
    ) 
    onlyOracle
    onlyAllowed(_for)
    onlySale
    notSoftcapReached
    public
    returns (uint)
    {
        require(_token == token);
        require(_value != 0);

        uint _tokenSoftcap = tokenSoftcap;
        uint _issued = tokenSoftcapIssued;
        if (_issued.add(_value) > _tokenSoftcap) {
            _value = _tokenSoftcap.sub(_issued);
        }

        tokenSoftcapIssued = _issued.add(_value);

        if (!Token(_token).transfer(_for, _value)) {
            revert();
        }

        _emitEmission(Token(_token).smbl(), _for, _value);
        return OK;
    }

    /// @notice Performs finish hardcap manually
    /// Only by contract owner and in sale period
    function finishHardcap() public onlyContractOwner onlySale notHardcapReached returns (uint) {
        finishedHardcap = true;
        _emitHardcapFinishedManually();
        return OK;
    }

    /// @notice Performs distribution of sent BMC tokens and send them to Profiterole address
    /// Only by oracle address and after reaching hardcap conditions
    function distributeBonuses() public onlyOracle onlySaleFinished notDestructed returns (uint) {
        ERC20Interface _token = ERC20Interface(bonusToken);
        uint _balance = _token.balanceOf(address(this));

        if (_balance == 0) {
            return _emitError(EMISSION_PROVIDER_ERROR_INSUFFICIENT_BMC);
        }

        Profiterole _profiterole = Profiterole(profiterole);
        if (!_token.approve(address(_profiterole), _balance)) {
            return _emitError(EMISSION_PROVIDER_ERROR_INTERNAL);
        }

        if (OK != _profiterole.distributeBonuses(_balance)) {
            revert();
        }

        return OK;
    }

    /// @notice Activates distruction.
    /// Access allowed only by contract owner after distruction
    function activateDestruction() public onlyContractOwner onlySaleFinished notDestructed returns (uint) {
        destructed = true;
        _emitDestruction();
        return OK;
    }

    /* ServiceAllowance */

    /// @notice Restricts transfers only for:
    /// 1) oracle and only ATx tokens;
    /// 2) from itself to holder
    function isTransferAllowed(address _from, address _to, address, address _token, uint) public view returns (bool) {
        if (_from == address(this) && _token == token && whitelist[_to]) {
            return true;
        }
    }
}
