const { ethers } = require("hardhat")
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { assert } = require("chai")

describe("Price Consumer Unit Tests", async function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployP2pExAggrFixture() {
    const [deployer] = await ethers.getSigners()

    const DECIMALS = "18"
    const ETH_PRICE = "2000000000000000000000"
    const BNB_PRICE = "300000000000000000000"

    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator")
    
    const usdEthAggr = await mockV3AggregatorFactory
        .connect(deployer)
        .deploy(DECIMALS, ETH_PRICE)

    const usdBnbAggr = await mockV3AggregatorFactory
        .connect(deployer)
        .deploy(DECIMALS, BNB_PRICE)


    const p2pExFactory = await ethers.getContractFactory("P2pEx")
    const p2pEx = await p2pExFactory
        .connect(deployer)
        .deploy()

    return { usdEthAggr, usdBnbAggr, p2pEx, DECIMALS }
    }

    describe("#getLatestPrice", async function () {
        describe("success", async function () {
            it("should return the same value as the mock", async () => {
                const { usdEthAggr, usdBnbAggr, p2pEx, DECIMALS } = await loadFixture(
                deployP2pExAggrFixture
                )
                //Mock ETH
                const ethPriceFromP2pEx = await p2pEx.getLatestPrice(usdEthAggr.address)
                const ethPriceFromMock = (await usdEthAggr.latestRoundData()).answer
                assert.equal(ethPriceFromP2pEx.toString(), ethPriceFromMock.toString())
                //Mock BNB
                const bnbPriceFromP2pEx = await p2pEx.getLatestPrice(usdBnbAggr.address)
                const bnbPriceFromMock = (await usdBnbAggr.latestRoundData()).answer
                assert.equal(bnbPriceFromP2pEx.toString(), bnbPriceFromMock.toString())

                console.log("ethPrice: %d USD -- bnbPrice: %d USD", ethPriceFromP2pEx/Math.pow(10, DECIMALS), bnbPriceFromP2pEx/Math.pow(10, DECIMALS))
            })
        })
    })
})
