pragma solidity ^0.4.18;


contract BurningManInterface {

    event EthReceived(address indexed from, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);

    event TokenBurnRequested(address indexed token, uint256 amount, address indexed from);
    event TokenBurnReverted(address indexed token, uint256 amount, address indexed from);
    event BuybackFinalized();
    event Error(uint code);

    function registerSell(uint _amount) public returns (uint);
    function revertSell(uint _amount) public returns (uint);
    function finalizeBuyback() public returns (uint);

    function getEstimatedToDepositEth() public view returns (uint);
    function getEstimatedRdFeeAmount() public view returns (uint);
    function withdrawEth(uint _amount) public returns (uint);
}
