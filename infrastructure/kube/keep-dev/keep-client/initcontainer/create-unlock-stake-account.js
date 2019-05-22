
/*
We override transactionConfirmationBlocks and transactionBlockTimeout because they're
25 and 50 blocks respectively at default.  The result of this on small private testnets
is long wait times for scripts to execute.
*/
const web3_options = {
    defaultBlock: 'latest',
    defaultGas: 4712388,
    transactionBlockTimeout: 25,
    transactionConfirmationBlocks: 3,
    transactionPollingTimeout: 480
}
const Web3 = require('web3');
// ENV VARs sourced from InitContainer Dockerfile
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HOSTNAME + ":" + process.env.ETH_HOST_PORT), null, web3_options);
const fs = require('fs');

/*
Each <contract.json> file is sourced directly from the InitContainer.  Files are generated by
Truffle during contract and copied to the InitContainer image via Circle.
*/
const stakingProxyContractJsonFile = "/tmp/StakingProxy.json";
const stakingProxyContractParsed = JSON.parse(fs.readFileSync(stakingProxyContractJsonFile));
const stakingProxyContractAbi = stakingProxyContractParsed.abi;
// ENV VAR sourced from InitContainer Dockerfile
const stakingProxyContractAddress = stakingProxyContractParsed.networks[process.env.ETH_NETWORK_ID].address;
const stakingProxyContract = new web3.eth.Contract(stakingProxyContractAbi, stakingProxyContractAddress);

// tokenStaking
const tokenStakingContractJsonFile = "/tmp/TokenStaking.json";
const tokenStakingContractParsed = JSON.parse(fs.readFileSync(tokenStakingContractJsonFile));
const tokenStakingContractAbi = tokenStakingContractParsed.abi;
const tokenStakingContractAddress = tokenStakingContractParsed.networks[process.env.ETH_NETWORK_ID].address;
const tokenStakingContract = new web3.eth.Contract(tokenStakingContractAbi, tokenStakingContractAddress);

// keepToken
const keepTokenContractJsonFile = "/tmp/KeepToken.json";
const keepTokenContractParsed = JSON.parse(fs.readFileSync(keepTokenContractJsonFile));
const keepTokenContractAbi = keepTokenContractParsed.abi;
const keepTokenContractAddress = keepTokenContractParsed.networks[process.env.ETH_NETWORK_ID].address;
const keepTokenContract = new web3.eth.Contract(keepTokenContractAbi, keepTokenContractAddress);

// Eth account that contracts are migrated against. ENV VAR sourced from Docker image.
const contract_owner = process.env.CONTRACT_OWNER_ETH_ACCOUNT_ADDRESS;

// Stake a target eth account
async function stakeEthAccount() {

  await unlockEthAccount(contract_owner, process.env.KEEP_CLIENT_ETH_ACCOUNT_PASSWORD);

  console.log("<<<<<<<<<<<< Provisioning Operator Account " + ">>>>>>>>>>>>")
  let operator = await provisionOperatorAccount();
  let operator_account_address = operator["address"];
  // ENV VAR sourced from Docker image.
  let magpie = process.env.CONTRACT_OWNER_ETH_ACCOUNT_ADDRESS;

  let contract_owner_signed = await web3.eth.sign(web3.utils.soliditySha3(contract_owner), operator_account_address);
  let contract_owner_signature = contract_owner_signed.signature;

  let signature = Buffer.from(contract_owner_signature.substr(2), 'hex');
  let delegation = '0x' + Buffer.concat([Buffer.from(magpie.substr(2), 'hex'), signature]).toString('hex');

  try {
    console.log("<<<<<<<<<<<< Checking if stakingProxy/tokenStaking Contracts Are Authorized >>>>>>>>>>>>");
    if (!await stakingProxyContract.methods.isAuthorized(tokenStakingContract.address).call({from: contract_owner}))
    {
      console.log("Authorizing stakingProxy/tokenStaking Contracts")
      await stakingProxyContract.methods.authorizeContract(tokenStakingContract.address).send({from: contract_owner}).then((receipt) => {
      console.log(JSON.stringify(receipt));
      })
    }
    console.log("stakingProxy/tokenStaking Contracts Authorized!");
  }
  catch(error) {
    console.error(error);
  };

  try {
    console.log("<<<<<<<<<<<< Staking Account: " + operator_account_address + " >>>>>>>>>>>>");
    await keepTokenContract.methods.approveAndCall(
      tokenStakingContract.address,
      formatAmount(1000000, 18),
      delegation).send({from: contract_owner}).then((receipt) => {
        console.log(JSON.stringify(receipt));
        console.log("Account " + operator_account_address + " staked!");
      });
  }
  catch(error) {
    console.error(error);
  }
};

async function createEthAccount(account_name) {

  try {
    let eth_account = await web3.eth.accounts.create();
    fs.writeFile("/mnt/keep-client/config/eth_account_address", eth_account["address"], (error) => {
      if (error) throw error;
    });
    console.log(account_name + " Account "  + eth_account["address"] + " Created!");
    return eth_account
  }
  catch(error) {
    console.log(error);
  }
};

async function createEthAccountKeyfile(eth_account_private_key, eth_account_password) {

  try {
    let eth_account_keyfile = await web3.eth.accounts.encrypt(eth_account_private_key, eth_account_password);
    fs.writeFile("/mnt/keep-client/config/eth_account_keyfile", JSON.stringify(eth_account_keyfile), (error) => {
      if (error) throw error;
    });
  }
  catch(error) {
    console.error(error);
  }
};

async function unlockEthAccount(eth_account, eth_account_password) {

  try {
    console.log("<<<<<<<<<<<< Unlocking Account " + eth_account + " >>>>>>>>>>>>");
    await web3.eth.personal.unlockAccount(eth_account, eth_account_password, 150000);
    console.log("Account " + eth_account + " unlocked!");
  }
  catch(error) {
    console.error(error);
  }
};

async function provisionOperatorAccount() {

  let operator_eth_account_password = process.env.KEEP_CLIENT_ETH_ACCOUNT_PASSWORD;

  try {
    let operator = await createEthAccount("operator");
    await createEthAccountKeyfile(operator["privateKey"], operator_eth_account_password);
    await web3.eth.accounts.wallet.add(operator["privateKey"]);
    return operator;
  }
  catch(error) {
    console.error(error);
  }
};

/*
\heimdall aliens numbers.  Really though, the approveAndCall function expects numbers
in a particular format, this function facilitates that.
*/
function formatAmount(amount, decimals) {
  return '0x' + web3.utils.toBN(amount).mul(web3.utils.toBN(10).pow(web3.utils.toBN(decimals))).toString('hex');
};

stakeEthAccount();

