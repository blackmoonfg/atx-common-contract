pragma solidity ^0.4.18;


import "./ATxAsset.sol";


/// @title ATx Asset implementation contract.
///
/// Basic asset implementation contract, without any additional logic.
/// Every other asset implementation contracts should derive from this one.
/// Receives calls from the proxy, and calls back immediately without arguments modification.
///
/// Note: all the non constant functions return false instead of throwing in case if state change
/// didn't happen yet.
contract ExampleAsset is ATxAsset {
}
