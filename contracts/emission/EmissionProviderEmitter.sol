pragma solidity ^0.4.18;


/// @title EmissionProviderEmitter
///
/// Organizes and provides a set of events specific for EmissionProvider's role
contract EmissionProviderEmitter {

    event Error(uint errorCode);
    event Emission(bytes32 smbl, address to, uint value);
    event HardcapFinishedManually();
    event Destruction();

    function _emitError(uint _errorCode) internal returns (uint) {
        Error(_errorCode);
        return _errorCode;
    }

    function _emitEmission(bytes32 _smbl, address _to, uint _value) internal {
        Emission(_smbl, _to, _value);
    }

    function _emitHardcapFinishedManually() internal {
        HardcapFinishedManually();
    }

    function _emitDestruction() internal {
        Destruction();
    }
}
