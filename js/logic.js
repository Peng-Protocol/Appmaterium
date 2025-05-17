class Web3Logic {
    constructor() {
        this.walletAddress = null;
        this.chainId = null;
        this.rpcUrl = null;
        this.error = null;
        this.contracts = {
            factory: '0xAbd617983DCE1571D71cCC0F6C167cd72E8b9be7',
            lux: '0x9749156E590d0a8689Bc30F108773D7509D48A84',
            chapterMapper: '0x6E36C9b901fcc6bA468AccA471C805D67e6AAfb8',
            lightSource: '0x0a8a210aff1171da29d151a0bb6af8ef2360d170'
        };
    }

    async connectWallet() {
        if (typeof window.ethereum === 'undefined') {
            this.error = 'No Ethereum provider detected.';
            return { address: null, chainId: null, rpcUrl: null };
        }
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            this.walletAddress = accounts[0];
            this.chainId = await window.ethereum.request({ method: 'eth_chainId' });
            this.rpcUrl = window.ethereum.rpcUrl || 'unknown';
            this.error = null;
            window.ethereum.on('accountsChanged', (accounts) => {
                this.walletAddress = accounts[0] || null;
            });
            window.ethereum.on('chainChanged', (newChainId) => {
                this.chainId = newChainId;
                window.dispatchEvent(new Event('chainChanged'));
            });
        } catch (err) {
            this.error = 'Failed to connect wallet: ' + err.message;
        }
        return { address: this.walletAddress, chainId: this.chainId, rpcUrl: this.rpcUrl };
    }

    async getChainId() {
        return await window.ethereum.request({ method: 'eth_chainId' });
    }

    async switchNetwork() {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xd206' }]
            });
        } catch (err) {
            if (err.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0xd206',
                        chainName: 'Sonic Blaze Testnet',
                        rpcUrls: ['https://rpc.blaze.soniclabs.com'],
                        blockExplorerUrls: ['https://testnet.sonicscan.org'],
                        nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 }
                    }]
                });
            } else {
                throw err;
            }
        }
    }

    async callContract(address, method, params = []) {
        const data = this.encodeFunctionCall(method, params);
        const result = await window.ethereum.request({
            method: 'eth_call',
            params: [{ to: address, data }, 'latest']
        });
        return this.decodeResult(method, result);
    }

    async sendTransaction(address, method, params = [], value = '0x0') {
        const data = this.encodeFunctionCall(method, params);
        const tx = {
            from: this.walletAddress,
            to: address,
            data,
            value
        };
        return await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [tx]
        });
    }

    encodeFunctionCall(method, params) {
        const abi = this.getABI(method);
        const selector = method.match(/0x[a-fA-F0-9]{8}/)[0];
        const encodedParams = params.map((p, i) => {
            if (abi.inputs[i].type === 'address') return p.padStart(64, '0');
            if (abi.inputs[i].type === 'uint256') return BigInt(p).toString(16).padStart(64, '0');
            if (abi.inputs[i].type === 'string') {
                const hex = Buffer.from(p).toString('hex');
                return hex.padStart(64, '0');
            }
            return p;
        }).join('');
        return selector + encodedParams;
    }

    decodeResult(method, result) {
        const abi = this.getABI(method);
        if (abi.outputs.length === 0) return null;
        result = result.slice(2);
        const outputs = [];
        let offset = 0;
        for (const output of abi.outputs) {
            const value = result.slice(offset, offset + 64);
            if (output.type === 'address') {
                outputs.push('0x' + value.slice(24));
            } else if (output.type === 'uint256') {
                outputs.push(BigInt('0x' + value));
            } else if (output.type === 'string') {
                outputs.push(Buffer.from(value, 'hex').toString());
            } else if (output.type === 'address[]') {
                const len = parseInt(result.slice(offset, offset + 64), 16);
                const addresses = [];
                for (let i = 0; i < len; i++) {
                    addresses.push('0x' + result.slice(offset + 64 + i * 64 + 24, offset + 64 + (i + 1) * 64));
                }
                outputs.push(addresses);
            } else if (output.type === 'string[]') {
                const len = parseInt(result.slice(offset, offset + 64), 16);
                const strings = [];
                for (let i = 0; i < len; i++) {
                    strings.push(Buffer.from(result.slice(offset + 64 + i * 64, offset + 64 + (i + 1) * 64), 'hex').toString());
                }
                outputs.push(strings);
            }
            offset += 64;
        }
        return outputs.length === 1 ? outputs[0] : outputs;
    }

    getABI(method) {
        const abis = {
            'queryPartialName(0x01f2e8dc)': {
                inputs: [{ name: 'query', type: 'string' }],
                outputs: [{ type: 'address[]' }, { type: 'string[]' }],
                stateMutability: 'view'
            },
            'getHearerChapters(0x4efc3d12)': {
                inputs: [{ name: 'hearer', type: 'address' }],
                outputs: [{ type: 'address[]' }],
                stateMutability: 'view'
            },
            'isHearerSubscribed(0x1d3b9cb0)': {
                inputs: [{ name: 'hearer', type: 'address' }, { name: 'chapter', type: 'address' }],
                outputs: [{ type: 'bool' }],
                stateMutability: 'view'
            },
            'hear(0x80b448fe)': {
                inputs: [],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'silence(0xfa537f74)': {
                inputs: [],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'luminate(0xead08026)': {
                inputs: [{ name: 'dataEntry', type: 'string' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'addChapterName(0xefa12995)': {
                inputs: [{ name: 'name', type: 'string' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'addChapterImage(0x0691c1bb)': {
                inputs: [{ name: 'image', type: 'string' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'nextCycleBill(0x32244167)': {
                inputs: [{ name: 'key', type: 'string' }, { name: 'cellIndex', type: 'uint256' }, { name: 'ownKeys', type: 'string' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'billAndSet(0x793d6bbe)': {
                inputs: [{ name: 'hearer', type: 'address' }, { name: 'cycleIndexes', type: 'string' }, { name: 'ownKeys', type: 'string' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'chapterName(0x06a76993)': {
                inputs: [],
                outputs: [{ type: 'string' }],
                stateMutability: 'view'
            },
            'chapterImage(0x17f4e7e1)': {
                inputs: [],
                outputs: [{ type: 'string' }],
                stateMutability: 'view'
            },
            'elect(0x7bd955f3)': {
                inputs: [],
                outputs: [{ type: 'address' }],
                stateMutability: 'view'
            },
            'nextFeeInSeconds(0xa0fb5d94)': {
                inputs: [],
                outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
                stateMutability: 'view'
            },
            'getActiveHearersCount(0xfbd7c9d8)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'chapterFee(0x84f0f15a)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'lumenHeight(0xf4d87851)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'getLumen(0x2a642480)': {
                inputs: [{ name: 'index', type: 'uint256' }],
                outputs: [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
                stateMutability: 'view'
            },
            'historicalKeys(0xaec25182)': {
                inputs: [{ type: 'address' }, { type: 'uint256' }],
                outputs: [{ type: 'string' }],
                stateMutability: 'view'
            },
            'isHearer(0x88302aac)': {
                inputs: [{ name: 'hearer', type: 'address' }],
                outputs: [{ type: 'address' }, { type: 'string' }, { type: 'uint256' }, { type: 'bool' }],
                stateMutability: 'view'
            },
            'getCellHearers(0x56551822)': {
                inputs: [{ name: 'cellIndex', type: 'uint256' }],
                outputs: [{ type: 'address[]' }],
                stateMutability: 'view'
            },
            'getCellHeight(0x2c5b8b7b)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'getLaggards(0xdee324c5)': {
                inputs: [],
                outputs: [{ type: 'address[]' }],
                stateMutability: 'view'
            },
            'cycleKey(0xa4f91194)': {
                inputs: [{ type: 'uint256' }],
                outputs: [{ type: 'string' }],
                stateMutability: 'view'
            },
            'chapterCycle(0x6f617672)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'pendingCycle(0xa155285f)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'reElect(0xfc7be2b2)': {
                inputs: [{ name: 'newElect', type: 'address' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'claim(0x1e83409a)': {
                inputs: [{ name: 'token', type: 'address' }],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'claimReward(0xb88a802f)': {
                inputs: [],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'mintRewards(0x234cb051)': {
                inputs: [],
                outputs: [],
                stateMutability: 'nonpayable'
            },
            'rewardEligibility(0xfcec6769)': {
                inputs: [{ type: 'address' }],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'swapCount(0x2eff0d9e)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'swapThreshold(0x0445b667)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'approve(0x095ea7b3)': {
                inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
                outputs: [{ type: 'bool' }],
                stateMutability: 'nonpayable'
            },
            'balanceOf(0x70a08231)': {
                inputs: [{ name: 'account', type: 'address' }],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'symbol(0x95d89b41)': {
                inputs: [],
                outputs: [{ type: 'string' }],
                stateMutability: 'view'
            },
            'decimals(0x313ce567)': {
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'allowance(0xdd62ed3e)': {
                inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view'
            },
            'deployChapter(0x4e6e8e75)': {
                inputs: [{ name: 'elect', type: 'address' }, { name: 'feeInterval', type: 'uint256' }, { name: 'chapterFee', type: 'uint256' }, { name: 'chapterToken', type: 'address' }],
                outputs: [],
                stateMutability: 'nonpayable'
            }
        };
        return abis[method];
    }

    async queryPartialName(query) {
        return await this.callContract(this.contracts.chapterMapper, 'queryPartialName(0x01f2e8dc)', [query]);
    }

    async getHearerChapters(hearer) {
        return await this.callContract(this.contracts.chapterMapper, 'getHearerChapters(0x4efc3d12)', [hearer]);
    }

    async isHearerSubscribed(hearer, chapter) {
        return await this.callContract(this.contracts.chapterMapper, 'isHearerSubscribed(0x1d3b9cb0)', [hearer, chapter]);
    }

    async hear(chapter) {
        return await this.sendTransaction(chapter, 'hear(0x80b448fe)');
    }

    async silence(chapter) {
        return await this.sendTransaction(chapter, 'silence(0xfa537f74)');
    }

    async luminate(chapter, dataEntry) {
        return await this.sendTransaction(chapter, 'luminate(0xead08026)', [dataEntry]);
    }

    async addChapterName(chapter, name) {
        return await this.sendTransaction(chapter, 'addChapterName(0xefa12995)', [name]);
    }

    async addChapterImage(chapter, image) {
        return await this.sendTransaction(chapter, 'addChapterImage(0x0691c1bb)', [image]);
    }

    async nextCycleBill(chapter, key, cellIndex, ownKeys) {
        return await this.sendTransaction(chapter, 'nextCycleBill(0x32244167)', [key, cellIndex, ownKeys]);
    }

    async billAndSet(chapter, hearer, cycleIndexes, ownKeys) {
        return await this.sendTransaction(chapter, 'billAndSet(0x793d6bbe)', [hearer, cycleIndexes, ownKeys]);
    }

    async getChapterName(chapter) {
        return await this.callContract(chapter, 'chapterName(0x06a76993)');
    }

    async getChapterImage(chapter) {
        return await this.callContract(chapter, 'chapterImage(0x17f4e7e1)');
    }

    async isElect(chapter, address) {
        const elect = await this.callContract(chapter, 'elect(0x7bd955f3)');
        return elect.toLowerCase() === address.toLowerCase();
    }

    async getNextFee(chapter) {
        const [seconds] = await this.callContract(chapter, 'nextFeeInSeconds(0xa0fb5d94)');
        const due = seconds === 0n;
        return { timestamp: seconds, isDue: due };
    }

    async getActiveHearersCount(chapter) {
        return await this.callContract(chapter, 'getActiveHearersCount(0xfbd7c9d8)');
    }

    async getChapterFee(chapter) {
        return await this.callContract(chapter, 'chapterFee(0x84f0f15a)');
    }

    async getChapterToken(chapter) {
        return this.contracts.lux; // Simplified, assumes LUX
    }

    async getLumenHeight(chapter) {
        return await this.callContract(chapter, 'lumenHeight(0xf4d87851)');
    }

    async getLumen(chapter, index) {
        const [dataEntry, cycle, idx, timestamp] = await this.callContract(chapter, 'getLumen(0x2a642480)', [index]);
        return { dataEntry, cycle, index: idx, timestamp };
    }

    async getHistoricalKey(chapter, address, cycle) {
        return await this.callContract(chapter, 'historicalKeys(0xaec25182)', [address, cycle]);
    }

    async getCellHearers(chapter, cellIndex) {
        return await this.callContract(chapter, 'getCellHearers(0x56551822)', [cellIndex]);
    }

    async getCellHeight(chapter) {
        return await this.callContract(chapter, 'getCellHeight(0x2c5b8b7b)');
    }

    async getLaggards(chapter) {
        return await this.callContract(chapter, 'getLaggards(0xdee324c5)');
    }

    async getCycleKeys(chapter) {
        const cycle = await this.callContract(chapter, 'chapterCycle(0x6f617672)');
        const keys = [];
        for (let i = 0; i <= cycle; i++) {
            keys.push(await this.callContract(chapter, 'cycleKey(0xa4f91194)', [i]));
        }
        return keys;
    }

    async reElect(chapter, newElect) {
        return await this.sendTransaction(chapter, 'reElect(0xfc7be2b2)', [newElect]);
    }

    async claimLux() {
        return await this.sendTransaction(this.contracts.lightSource, 'claim(0x1e83409a)', [this.contracts.lux]);
    }

    async getLightSourceBalance() {
        return await this.callContract(this.contracts.lux, 'balanceOf(0x70a08231)', [this.contracts.lightSource]);
    }

    async claimReward() {
        return await this.sendTransaction(this.contracts.lux, 'claimReward(0xb88a802f)');
    }

    async mintRewards() {
        return await this.sendTransaction(this.contracts.lux, 'mintRewards(0x234cb051)');
    }

    async getRewardEligibility(address) {
        return await this.callContract(this.contracts.lux, 'rewardEligibility(0xfcec6769)', [address]);
    }

    async getSwapCount() {
        return await this.callContract(this.contracts.lux, 'swapCount(0x2eff0d9e)');
    }

    async getSwapThreshold() {
        return await this.callContract(this.contracts.lux, 'swapThreshold(0x0445b667)');
    }

    async approveToken(token, spender, amount) {
        return await this.sendTransaction(token, 'approve(0x095ea7b3)', [spender, amount]);
    }

    async getTokenBalance(token, account) {
        return await this.callContract(token, 'balanceOf(0x70a08231)', [account]);
    }

    async getTokenSymbol(token) {
        return await this.callContract(token, 'symbol(0x95d89b41)');
    }

    async getAllowance(token, owner, spender) {
        return await this.callContract(token, 'allowance(0xdd62ed3e)', [owner, spender]);
    }

    async deployChapter(elect, feeInterval, chapterFee, chapterToken) {
        return await this.sendTransaction(this.contracts.factory, 'deployChapter(0x4e6e8e75)', [elect, feeInterval, chapterFee, chapterToken]);
    }

    async getPublicKey(address) {
        return await window.ethereum.request({
            method: 'eth_getEncryptionPublicKey',
            params: [address]
        });
    }

    async decryptKey(encryptedKey) {
        return await window.ethereum.request({
            method: 'eth_decrypt',
            params: [encryptedKey, this.walletAddress]
        });
    }
}

window.web3Logic = new Web3Logic();