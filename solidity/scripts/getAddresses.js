const KeepToken = artifacts.require("KeepToken")
const TokenStaking = artifacts.require("TokenStaking")
const KeepRandomBeaconOperator = artifacts.require("./KeepRandomBeaconOperator.sol");
module.exports = async function(callback) {
    try {

        console.log("KeepToken:", (await KeepToken.deployed()).address)
        console.log("TokenStaking:", (await TokenStaking.deployed()).address)
        console.log("OperatorContract:", (await KeepRandomBeaconOperator.deployed()).address)
        callback()
    } catch (e) {
        callback(e)
    }
}