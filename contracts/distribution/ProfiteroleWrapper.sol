pragma solidity ^0.4.18;


import "./Profiterole.sol";


contract ProfiteroleWrapper is Profiterole {

    function ProfiteroleWrapper(address _bonusToken, address _treasury, address _wallet)
    Profiterole(_bonusToken, _treasury, _wallet)
    public
    {
    }

    function testOraclePresence() public view returns (bool) {
        if (oracles[msg.sender]) {
            return true;
        }
    }

    function testDistributionSourcePresence() public view returns (bool) {
        if (distributionSourcesList[msg.sender]) {
            return true;
        }
    }

}
