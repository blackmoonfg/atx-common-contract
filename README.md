# Blackmoon ATx Fund Token SmartContracts

Common set of contracts to create fund token under Blackmoon ATx Platform.
This set of contracts must be cloned and tuned for a particular fund token.

- ATxProxy.sol acts as a transaction proxy, provide an ERC20 interface (described in ERC20Interface.sol) and allows additional logic insertions and wallet access recovery in case of key loss.
- ATxAsset.sol holds transactions logic and apply holders restrictions
- DataController.sol store all holder data.
- EmissionProvider.sol creates issues for a fund token
- BurningMan.sol creates redemptions for a fund token
- Treasury.sol keep balances and bmc-days for a contributors
- Profiterole.sol distributes fees on issue and redemption for contributors

To understand contract logic better you can take a look at the comments also as at unit tests

## Testing

NodeJS 6+ required.
```bash
npm install -g ethereumjs-testrpc
npm install -g truffle
```

Then start TestRPC in a separate terminal by doing
```bash
testrpc
```

Then run tests in a project dir by doing
```bash
truffle compile
truffle test
```
