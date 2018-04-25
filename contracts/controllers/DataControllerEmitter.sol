pragma solidity ^0.4.18;


contract DataControllerEmitter {

    event CountryCodeAdded(uint _countryCode, uint _countryId, uint _maxHolderCount);
    event CountryCodeChanged(uint _countryCode, uint _countryId, uint _maxHolderCount);

    event HolderRegistered(bytes32 _externalHolderId, uint _accessIndex, uint _countryCode);
    event HolderAddressAdded(bytes32 _externalHolderId, address _holderPrototype, uint _accessIndex);
    event HolderAddressRemoved(bytes32 _externalHolderId, address _holderPrototype, uint _accessIndex);
    event HolderOperationalChanged(bytes32 _externalHolderId, bool _operational);

    event DayLimitChanged(bytes32 _externalHolderId, uint _from, uint _to);
    event MonthLimitChanged(bytes32 _externalHolderId, uint _from, uint _to);

    event OracleAdded(bytes4 _sig, address _oracle);
    event OracleRemoved(bytes4 _sig, address _oracle);

    event Error(uint _errorCode);

    function _emitHolderAddressAdded(bytes32 _externalHolderId, address _holderPrototype, uint _accessIndex) internal {
        HolderAddressAdded(_externalHolderId, _holderPrototype, _accessIndex);
    }

    function _emitHolderAddressRemoved(bytes32 _externalHolderId, address _holderPrototype, uint _accessIndex) internal {
        HolderAddressRemoved(_externalHolderId, _holderPrototype, _accessIndex);
    }

    function _emitHolderRegistered(bytes32 _externalHolderId, uint _accessIndex, uint _countryCode) internal {
        HolderRegistered(_externalHolderId, _accessIndex, _countryCode);
    }

    function _emitHolderOperationalChanged(bytes32 _externalHolderId, bool _operational) internal {
        HolderOperationalChanged(_externalHolderId, _operational);
    }

    function _emitCountryCodeAdded(uint _countryCode, uint _countryId, uint _maxHolderCount) internal {
        CountryCodeAdded(_countryCode, _countryId, _maxHolderCount);
    }

    function _emitCountryCodeChanged(uint _countryCode, uint _countryId, uint _maxHolderCount) internal {
        CountryCodeChanged(_countryCode, _countryId, _maxHolderCount);
    }

    function _emitDayLimitChanged(bytes32 _externalHolderId, uint _from, uint _to) internal {
        DayLimitChanged(_externalHolderId, _from, _to);
    }

    function _emitMonthLimitChanged(bytes32 _externalHolderId, uint _from, uint _to) internal {
        MonthLimitChanged(_externalHolderId, _from, _to);
    }

    function _emitOracleAdded(bytes4 _sig, address _oracle) internal {
        OracleAdded(_sig, _oracle);
    }

    function _emitOracleRemoved(bytes4 _sig, address _oracle) internal {
        OracleRemoved(_sig, _oracle);
    }

    function _emitError(uint _errorCode) internal returns (uint) {
        Error(_errorCode);
        return _errorCode;
    }
}
