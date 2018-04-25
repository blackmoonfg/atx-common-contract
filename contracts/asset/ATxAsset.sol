pragma solidity ^0.4.18;


import "bmc-contract/contracts/core/common/Owned.sol";
import "bmc-contract/contracts/core/lib/SafeMath.sol";
import {ATxAssetProxyInterface as ATxProxy} from "bmc-contract/contracts/atx/asset/ATxAssetProxyInterface.sol";
import "bmc-contract/contracts/atx/asset/BasicAsset.sol";
import "bmc-contract/contracts/atx/asset/ServiceAllowance.sol";
import "../controllers/ServiceController.sol";
import "../controllers/DataController.sol";


/// @title ATx Asset implementation contract.
///
/// Basic asset implementation contract, without any additional logic.
/// Every other asset implementation contracts should derive from this one.
/// Receives calls from the proxy, and calls back immediately without arguments modification.
///
/// Note: all the non constant functions return false instead of throwing in case if state change
/// didn't happen yet.
contract ATxAsset is BasicAsset, Owned {

    uint public constant OK = 1;

    using SafeMath for uint;

    enum Roles {
        Holder,
        Service,
        Other
    }

    ServiceController public serviceController;
    DataController public dataController;
    uint public lockupDate;

    /// @notice Default constructor for ATxAsset.
    function ATxAsset() public {
    }

    function() payable public {
        revert();
    }

    /// @notice Init function for ATxAsset.
    ///
    /// @param _proxy - atx asset proxy.
    /// @param _serviceController - service controoler.
    /// @param _dataController - data controller.
    /// @param _lockupDate - th lockup date.
    function initAtx(address _proxy, address _serviceController, address _dataController, uint _lockupDate) public onlyContractOwner returns (bool) {
        require(_serviceController != 0x0);
        require(_dataController != 0x0);
        require(_proxy != 0x0);
        require(_lockupDate > now || _lockupDate == 0);

        if (!super.init(ATxProxy(_proxy))) {
            return false;
        }

        serviceController = ServiceController(_serviceController);
        dataController = DataController(_dataController);
        lockupDate = _lockupDate;
        return true;
    }

    /// @notice Performs transfer call on the platform by the name of specified sender.
    ///
    /// @dev Can only be called by proxy asset.
    ///
    /// @param _to holder address to give to.
    /// @param _value amount to transfer.
    /// @param _reference transfer comment to be included in a platform's Transfer event.
    /// @param _sender initial caller.
    ///
    /// @return success.
    function __transferWithReference(address _to, uint _value, string _reference, address _sender) public onlyProxy returns (bool) {
        var (_fromRole, _toRole) = _getParticipantRoles(_sender, _to);

        if (!_checkTransferAllowance(_to, _toRole, _value, _sender, _fromRole)) {
            return false;
        }

        if (!_isValidCountryLimits(_to, _toRole, _value, _sender, _fromRole)) {
            return false;
        }

        if (!super.__transferWithReference(_to, _value, _reference, _sender)) {
            return false;
        }

        _updateTransferLimits(_to, _toRole, _value, _sender, _fromRole);

        return true;
    }

    /// @notice Performs allowance transfer call on the platform by the name of specified sender.
    ///
    /// @dev Can only be called by proxy asset.
    ///
    /// @param _from holder address to take from.
    /// @param _to holder address to give to.
    /// @param _value amount to transfer.
    /// @param _reference transfer comment to be included in a platform's Transfer event.
    /// @param _sender initial caller.
    ///
    /// @return success.
    function __transferFromWithReference(address _from, address _to, uint _value, string _reference, address _sender) public onlyProxy returns (bool) {
        var (_fromRole, _toRole) = _getParticipantRoles(_from, _to);

        // @note Special check for operational withdraw.
        bool _isTransferFromHolderToContractOwner = _fromRole == Roles.Holder && contractOwner == _to && dataController.allowance(_from) >= _value && super.__transferFromWithReference(_from, _to, _value, _reference, _sender);
        if (_isTransferFromHolderToContractOwner) {
            return true;
        }

        if (!_checkTransferAllowanceFrom(_to, _toRole, _value, _from, _fromRole, _sender)) {
            return false;
        }

        if (!_isValidCountryLimits(_to, _toRole, _value, _from, _fromRole)) {
            return false;
        }

        if (!super.__transferFromWithReference(_from, _to, _value, _reference, _sender)) {
            return false;
        }

        _updateTransferLimits(_to, _toRole, _value, _from, _fromRole);

        return true;
    }

    function _isTokenActive() internal view returns (bool) {
        return now > lockupDate;
    }

    function _checkTransferAllowance(address _to, Roles _toRole, uint _value, address _from, Roles _fromRole) internal view returns (bool) {
        if (_to == proxy) {
            return false;
        }

        bool _canTransferFromService = _fromRole == Roles.Service && ServiceAllowance(_from).isTransferAllowed(_from, _to, _from, proxy, _value);
        bool _canTransferToService = _toRole == Roles.Service && ServiceAllowance(_to).isTransferAllowed(_from, _to, _from, proxy, _value);
        bool _canTransferToHolder = _toRole == Roles.Holder && _couldDepositToHolder(_to, _value);

        bool _canTransferFromHolder;

        if (_isTokenActive()) {
            _canTransferFromHolder = _fromRole == Roles.Holder && _couldWithdrawFromHolder(_from, _value);
        } else {
            _canTransferFromHolder = _fromRole == Roles.Holder && _couldWithdrawFromHolder(_from, _value) && _from == contractOwner;
        }

        return (_canTransferFromHolder || _canTransferFromService) && (_canTransferToHolder || _canTransferToService);
    }

    function _checkTransferAllowanceFrom(address _to, Roles _toRole, uint _value, address _from, Roles _fromRole, address) internal view returns (bool) {
        return _checkTransferAllowance(_to, _toRole, _value, _from, _fromRole);
    }

    function _isValidWithdrawLimits(uint _sendLimPerDay, uint _sendLimPerMonth, uint _value) internal pure returns (bool) {
        return !(_value > _sendLimPerDay || _value > _sendLimPerMonth);
    }

    function _isValidDepositCountry(
        uint _value,
        uint _withdrawCountryCode,
        uint _withdrawBalance,
        uint _countryCode,
        uint _balance,
        uint _currentHolderCount,
        uint _maxHolderNumber
    )
    internal
    pure
    returns (bool)
    {
        return _isNoNeedInCountryLimitChange(_value, _withdrawCountryCode, _withdrawBalance, _countryCode, _balance, _currentHolderCount, _maxHolderNumber)
        ? true
        : _isValidDepositCountry(_balance, _currentHolderCount, _maxHolderNumber);
    }

    function _isNoNeedInCountryLimitChange(
        uint _value,
        uint _withdrawCountryCode,
        uint _withdrawBalance,
        uint _countryCode,
        uint _balance,
        uint _currentHolderCount,
        uint _maxHolderNumber
    )
    internal
    pure
    returns (bool)
    {
        bool _needToIncrementCountryHolderCount = _balance == 0;
        bool _needToDecrementCountryHolderCount = _withdrawBalance == _value;
        bool _shouldOverflowCountryHolderCount = _currentHolderCount == _maxHolderNumber;

        return _withdrawCountryCode == _countryCode && _needToDecrementCountryHolderCount && _needToIncrementCountryHolderCount && _shouldOverflowCountryHolderCount;
    }

    function _updateCountries(
        uint _value,
        uint _withdrawCountryCode,
        uint _withdrawBalance,
        uint _withdrawCurrentHolderCount,
        uint _countryCode,
        uint _balance,
        uint _currentHolderCount,
        uint _maxHolderNumber
    )
    internal
    {
        if (_isNoNeedInCountryLimitChange(_value, _withdrawCountryCode, _withdrawBalance, _countryCode, _balance, _currentHolderCount, _maxHolderNumber)) {
            return;
        }

        _updateWithdrawCountry(_value, _withdrawCountryCode, _withdrawBalance, _withdrawCurrentHolderCount);
        _updateDepositCountry(_countryCode, _balance, _currentHolderCount);
    }

    function _updateWithdrawCountry(
        uint _value,
        uint _countryCode,
        uint _balance,
        uint _currentHolderCount
    )
    internal
    {
        if (_value == _balance && OK != dataController.updateCountryHoldersCount(_countryCode, _currentHolderCount.sub(1))) {
            revert();
        }
    }

    function _updateDepositCountry(
        uint _countryCode,
        uint _balance,
        uint _currentHolderCount
    )
    internal
    {
        if (_balance == 0 && OK != dataController.updateCountryHoldersCount(_countryCode, _currentHolderCount.add(1))) {
            revert();
        }
    }

    function _getParticipantRoles(address _from, address _to) private view returns (Roles _fromRole, Roles _toRole) {
        _fromRole = dataController.isRegisteredAddress(_from) ? Roles.Holder : (serviceController.isService(_from) ? Roles.Service : Roles.Other);
        _toRole = dataController.isRegisteredAddress(_to) ? Roles.Holder : (serviceController.isService(_to) ? Roles.Service : Roles.Other);
    }

    function _couldWithdrawFromHolder(address _holder, uint _value) private view returns (bool) {
        bytes32 _holderId = dataController.getHolderExternalIdByAddress(_holder);
        var (, _limPerDay, _limPerMonth, _operational,) = dataController.getHolderInfo(_holderId);
        return _operational ? _isValidWithdrawLimits(_limPerDay, _limPerMonth, _value) : false;
    }

    function _couldDepositToHolder(address _holder, uint) private view returns (bool) {
        bytes32 _holderId = dataController.getHolderExternalIdByAddress(_holder);
        var (,,, _operational,) = dataController.getHolderInfo(_holderId);
        return _operational;
    }

    //TODO need additional check: not clear check of country limit:
    function _isValidDepositCountry(uint _balance, uint _currentHolderCount, uint _maxHolderNumber) private pure returns (bool) {
        return !(_balance == 0 && _currentHolderCount == _maxHolderNumber);
    }

    function _getHoldersInfo(address _to, Roles _toRole, uint, address _from, Roles _fromRole)
    private
    view
    returns (
        uint _fromCountryCode,
        uint _fromBalance,
        uint _toCountryCode,
        uint _toCountryCurrentHolderCount,
        uint _toCountryMaxHolderNumber,
        uint _toBalance
    ) {
        bytes32 _holderId;
        if (_toRole == Roles.Holder) {
            _holderId = dataController.getHolderExternalIdByAddress(_to);
            _toCountryCode = dataController.getHolderCountryCode(_holderId);
            (_toCountryCurrentHolderCount, _toCountryMaxHolderNumber) = dataController.getCountryInfo(_toCountryCode);
            _toBalance = ERC20Interface(proxy).balanceOf(_to);
        }

        if (_fromRole == Roles.Holder) {
            _holderId = dataController.getHolderExternalIdByAddress(_from);
            _fromCountryCode = dataController.getHolderCountryCode(_holderId);
            _fromBalance = ERC20Interface(proxy).balanceOf(_from);
        }
    }

    function _isValidCountryLimits(address _to, Roles _toRole, uint _value, address _from, Roles _fromRole) private view returns (bool) {
        var (
        _fromCountryCode,
        _fromBalance,
        _toCountryCode,
        _toCountryCurrentHolderCount,
        _toCountryMaxHolderNumber,
        _toBalance
        ) = _getHoldersInfo(_to, _toRole, _value, _from, _fromRole);

        //TODO not clear for which case this check
        bool _isValidLimitFromHolder = _fromRole == _toRole && _fromRole == Roles.Holder && !_isValidDepositCountry(_value, _fromCountryCode, _fromBalance, _toCountryCode, _toBalance, _toCountryCurrentHolderCount, _toCountryMaxHolderNumber);
        bool _isValidLimitsToHolder = _toRole == Roles.Holder && !_isValidDepositCountry(_toBalance, _toCountryCurrentHolderCount, _toCountryMaxHolderNumber);

        return !(_isValidLimitFromHolder || _isValidLimitsToHolder);
    }

    function _updateTransferLimits(address _to, Roles _toRole, uint _value, address _from, Roles _fromRole) private {
        var (
        _fromCountryCode,
        _fromBalance,
        _toCountryCode,
        _toCountryCurrentHolderCount,
        _toCountryMaxHolderNumber,
        _toBalance
        ) = _getHoldersInfo(_to, _toRole, _value, _from, _fromRole);

        if (_fromRole == Roles.Holder && OK != dataController.withdrawFrom(_from, _value)) {
            revert();
        }

        if (_toRole == Roles.Holder && OK != dataController.depositTo(_from, _value)) {
            revert();
        }

        uint _fromCountryCurrentHolderCount;
        if (_fromRole == Roles.Holder && _fromRole == _toRole) {
            (_fromCountryCurrentHolderCount,) = dataController.getCountryInfo(_fromCountryCode);
            _updateCountries(
                _value,
                _fromCountryCode,
                _fromBalance,
                _fromCountryCurrentHolderCount,
                _toCountryCode,
                _toBalance,
                _toCountryCurrentHolderCount,
                _toCountryMaxHolderNumber
            );
        } else if (_fromRole == Roles.Holder) {
            (_fromCountryCurrentHolderCount,) = dataController.getCountryInfo(_fromCountryCode);
            _updateWithdrawCountry(_value, _fromCountryCode, _fromBalance, _fromCountryCurrentHolderCount);
        } else if (_toRole == Roles.Holder) {
            _updateDepositCountry(_toCountryCode, _toBalance, _toCountryCurrentHolderCount);
        }
    }
}
