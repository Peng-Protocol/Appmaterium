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
            this.error = 'No Ethereum provider detected. Install MetaMask.';
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
        if (!window.ethereum) throw new Error('Ethereum provider not found.');
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
        try {
            const result = await window.ethereum.request({
                method: 'eth_call',
                params: [{ to: address, data }, 'latest']
            });
            return this.decodeResult(method, result);
        } catch (err) {
            window.alert(`Contract call failed: ${err.message}`);
            throw err;
        }
    }

    async sendTransaction(address, method, params = [], value = '0x0') {
        const data = this.encodeFunctionCall(method, params);
        const tx = {
            from: this.walletAddress,
            to: address,
            data,
            value
        };
        try {
            return await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [tx]
            });
        } catch (err) {
            window.alert(`Transaction failed: ${err.message}`);
            throw err;
        }
    }

    encodeFunctionCall(method, params) {
        const abi = this.getABI(method);
        const selector = method.match(/0x[a-fA-F0-9]{8}/)[0];
        const encodedParams = params.map((p, i) => {
            if (abi.inputs[i].type === 'address') return p.padStart(64, '0').slice(-40);
            if (abi.inputs[i].type === 'uint256') return BigInt(p).toString(16).padStart(64, '0');
            if (abi.inputs[i].type === 'string') {
                const hex = Buffer.from(p).toString('hex');
                return (hex.length.toString(16).padStart(64, '0') + hex).padStart(128, '0');
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
                const len = parseInt(result.slice(offset + 64, offset + 128), 16);
                const str = Buffer.from(result.slice(offset + 128, offset + 128 + len * 2), 'hex').toString();
                outputs.push(str);
            } else if (output.type === 'address[]') {
                const len = parseInt(result.slice(offset, offset + 64), 16);
                const addresses = [];
                for (let i = 0; i < len; i++) {
                    addresses.push('0x' + result.slice(offset + 128 + i * 64 + 24, offset + 128 + (i + 1) * 64));
                }
                outputs.push(addresses);
            } else if (output.type === 'string[]') {
                const len = parseInt(result.slice(offset, offset + 64), 16);
                const strings = [];
                for (let i = 0; i < len; i++) {
                    const strLen = parseInt(result.slice(offset + 128 + i * 64, offset + 128 + (i + 1) * 64), 16);
                    const str = Buffer.from(result.slice(offset + 192 + i * 64, offset + 192 + i * 64 + strLen * 2), 'hex').toString();
                    strings.push(str);
                }
                outputs.push(strings);
            } else if (output.type === 'bool') {
                outputs.push(parseInt(value, 16) !== 0);
            }
            offset += 64;
        }
        return outputs.length === 1 ? outputs[0] : outputs;
    }

    getABI(method) {
        const abis = {
            'queryPartialName(0x01f2e8dc)': {
                inputs: [{ name: 'query', type: 'string' }],
                outputs: [{ name: 'addresses', type: 'address[]' }, { name: 'names', type: 'string[]' }],
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
            'deployChapter(0x