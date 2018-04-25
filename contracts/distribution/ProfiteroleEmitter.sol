pragma solidity ^0.4.18;


contract ProfiteroleEmitter {

    event DepositPendingAdded(uint amount, address from, uint timestamp);
    event BonusesWithdrawn(bytes32 userKey, uint amount, uint timestamp);

    event Error(uint errorCode);

    function _emitError(uint _errorCode) internal returns (uint) {
        Error(_errorCode);
        return _errorCode;
    }
}
