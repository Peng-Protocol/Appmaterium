document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        walletAddress: null,
        chainId: null,
        isCorrectNetwork: false,
        activeModal: null,
        searchQuery: '',
        searchResults: [],
        chapterData: {
            address: null,
            name: '',
            image: '',
            pendingFees: '0',
            hearerCount: 0,
            cycleProfit: '0',
            isSubscribed: false,
            isElect: false,
            posts: [],
            nameChanged: false,
            imageChanged: false,
            electChanged: false,
            rewards: '0',
            swapCount: 0,
            laggards: 0,
            nextFee: '',
            hasNotifications: false
        },
        chapterFeeInterval: '',
        chapterFeeAmount: '',
        chapterFeeToken: '0x9749156E590d0a8689Bc30F108773D7509D48A84',
        chapterFeeTokenLabel: 'LUX',
        lumenDataEntry: '',
        lumenIsPublic: false,
        lightSourceBalance: '0',
        encryptionKeys: [],
        isDarkMode: false,
        notifications: [],
        userFeed: {
            posts: [],
            subscriptions: [],
            showSubscriptions: false
        },
        catboxStatus: '',

        async initialize() {
            this.initializeMode();
            this.updateNetwork();
            await this.checkLightSourceBalance();
            this.startNotificationPolling();
            const pattern = Trianglify({
                width: window.innerWidth,
                height: window.innerHeight,
                cellSize: 50,
                xColors: this.isDarkMode ? ['#D3D3D3', '#696969'] : ['#696969', '#333333'],
                yColors: 'match'
            });
            document.body.style.backgroundImage = `url(${pattern.toCanvas().toDataURL()})`;
            document.body.classList.add('circuit-board');
        },

        initializeMode() {
            const savedMode = localStorage.getItem('isDarkMode');
            this.isDarkMode = savedMode === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : savedMode === 'true';
            this.applyMode();
        },

        toggleDarkMode() {
            this.isDarkMode = !this.isDarkMode;
            this.applyMode();
        },

        applyMode() {
            document.body.classList.toggle('dark-mode', this.isDarkMode);
            document.getElementById('modeToggle').textContent = this.isDarkMode ? '🌞' : '🌙';
            localStorage.setItem('isDarkMode', this.isDarkMode);
            this.initialize(); // Regenerate background
        },

        async updateNetwork() {
            const chainId = await window.web3Logic.getChainId();
            this.chainId = chainId;
            this.isCorrectNetwork = chainId === '0xd206';
            document.getElementById('networkSettings').innerHTML = this.isCorrectNetwork ? '<img src="./assets/sonicLogo.png" style="height: 20px;">' : '🌐';
            if (!this.isCorrectNetwork) {
                this.addNotification('Incorrect network, please switch to Sonic Blaze Testnet', 0);
            }
        },

        async handleNetworkSwitch() {
            if (!this.walletAddress) {
                alert('Connect wallet first');
                return;
            }
            if (!this.isCorrectNetwork) {
                await window.web3Logic.switchNetwork();
                await this.updateNetwork();
            }
        },

        async connectToWallet() {
            const connectButton = document.getElementById('connectWallet');
            connectButton.disabled = true;
            connectButton.textContent = 'Connecting...';
            try {
                const walletData = await window.web3Logic.connectWallet();
                if (walletData.address) {
                    this.walletAddress = walletData.address;
                    connectButton.textContent = `${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`;
                    connectButton.classList.add('connected');
                    this.closeModal('walletModal');
                    await this.updateNetwork();
                } else {
                    alert(window.web3Logic.error);
                }
            } catch (err) {
                alert('Failed to connect wallet.');
            } finally {
                connectButton.disabled = false;
                if (!this.walletAddress) connectButton.textContent = 'Connect Wallet';
            }
        },

        openModal(modalId) {
            this.activeModal = modalId;
            const modal = new bootstrap.Modal(document.getElementById(modalId));
            modal.show();
            if (modalId === 'qrModal') this.generateQRCode();
        },

        closeModal(modalId) {
            this.activeModal = null;
            const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
            if (modal) modal.hide();
        },

        async generateQRCode() {
            document.getElementById('qrError').style.display = 'none';
            const inputAddress = document.getElementById('qrAddress').value.trim();
            let uri;
            if (inputAddress && /^0x[a-fA-F0-9]{40}$/.test(inputAddress)) {
                uri = `ethereum:${inputAddress}@57054`;
            } else if (this.walletAddress) {
                uri = `ethereum:${this.walletAddress}@57054`;
            } else {
                uri = 'https://link.dexhune.eth.limo';
            }
            const canvas = document.getElementById('qrCanvas');
            QRCode.toCanvas(canvas, uri, { width: 300 }, (err) => {
                if (err) {
                    document.getElementById('qrError').style.display = 'block';
                    document.getElementById('qrError').textContent = 'QR Code generation failed.';
                } else {
                    document.getElementById('copyUri').style.display = 'block';
                }
            });
        },

        async copyURI() {
            const inputAddress = document.getElementById('qrAddress').value.trim();
            let uri;
            if (inputAddress && /^0x[a-fA-F0-9]{40}$/.test(inputAddress)) {
                uri = `ethereum:${inputAddress}@57054`;
            } else if (this.walletAddress) {
                uri = `ethereum:${this.walletAddress}@57054`;
            } else {
                uri = 'https://link.dexhune.eth.limo';
            }
            try {
                await navigator.clipboard.writeText(uri);
                this.addNotification('URI copied: ' + uri, 5000);
            } catch (err) {
                this.addNotification('Copy failed.', 5000);
            }
        },

        async searchChapters() {
            if (!this.searchQuery) {
                this.searchResults = [];
                return;
            }
            try {
                const results = await window.web3Logic.queryPartialName(this.searchQuery);
                this.searchResults = results.addresses.map((addr, i) => ({
                    address: addr,
                    name: results.names[i]
                }));
            } catch (err) {
                this.addNotification('Search failed.', 5000);
            }
        },

        async openChapterModal(address) {
            this.chapterData.address = address;
            try {
                const [name, image, nextFee, hearerCount, fee, token, isElect, isSubscribed] = await Promise.all([
                    window.web3Logic.getChapterName(address),
                    window.web3Logic.getChapterImage(address),
                    window.web3Logic.getNextFee(address),
                    window.web3Logic.getActiveHearersCount(address),
                    window.web3Logic.getChapterFee(address),
                    window.web3Logic.getChapterToken(address),
                    window.web3Logic.isElect(address, this.walletAddress),
                    window.web3Logic.isHearerSubscribed(this.walletAddress, address)
                ]);
                const symbol = await window.web3Logic.getTokenSymbol(token);
                this.chapterData.name = name;
                this.chapterData.image = image;
                this.chapterData.pendingFees = nextFee.isDue ? `${hearerCount * fee} ${symbol}` : '0';
                this.chapterData.hearerCount = hearerCount;
                this.chapterData.cycleProfit = `${hearerCount * fee} ${symbol}`;
                this.chapterData.isElect = isElect;
                this.chapterData.isSubscribed = isSubscribed;
                this.chapterData.posts = await this.fetchPosts(address);
                this.openModal('chapterModal');
            } catch (err) {
                this.addNotification('Failed to load chapter.', 5000);
            }
        },

        async fetchPosts(address) {
            const height = await window.web3Logic.getLumenHeight(address);
            const posts = [];
            for (let i = Math.max(0, height - 10); i < height; i++) {
                const lumen = await window.web3Logic.getLumen(address, i);
                let content = lumen.dataEntry;
                if (lumen.cycle > 0 && !this.lumenIsPublic) {
                    const key = await this.getDecryptedKey(address, lumen.cycle);
                    content = key ? await this.decryptContent(content, key) : 'Click to begin decryption';
                }
                const preview = marked.parse(content.slice(0, 200));
                const timestamp = this.formatTimestamp(lumen.timestamp);
                posts.push({ index: i, content, preview, timestamp });
            }
            return posts.reverse();
        },

        async getDecryptedKey(address, cycle) {
            let key = this.encryptionKeys.find(k => k.cycle === cycle && k.address === address)?.pureCycleKey;
            if (!key) {
                const ownKey = await window.web3Logic.getHistoricalKey(address, this.walletAddress, cycle);
                if (ownKey !== '0') {
                    key = await window.web3Logic.decryptKey(ownKey);
                    this.encryptionKeys.push({ cycle, address, pureCycleKey: key, ownKey });
                    localStorage.setItem('cachedKeys', JSON.stringify(this.encryptionKeys));
                }
            }
            return key;
        },

        async decryptContent(content, key) {
            try {
                const buffer = Buffer.from(content, 'hex');
                const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer.slice(0, 12) }, key, buffer.slice(12));
                return new TextDecoder().decode(decrypted);
            } catch (err) {
                return 'Decryption failed.';
            }
        },

        formatTimestamp(timestamp) {
            const date = new Date(timestamp * 1000);
            const now = new Date();
            const diff = (now - date) / (1000 * 3600);
            if (diff < 24) return `${Math.floor(diff)}h Ago`;
            return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        },

        async viewPost(post) {
            if (post.content.includes('Click to begin decryption')) {
                const key = await this.getDecryptedKey(this.chapterData.address, post.cycle);
                if (key) {
                    post.content = await this.decryptContent(post.content, key);
                    post.preview = marked.parse(post.content.slice(0, 200));
                }
            }
            this.chapterData.posts = [post];
            this.openModal('chapterModal');
        },

        async createChapter() {
            if (!this.chapterFeeInterval || !this.chapterFeeAmount || !this.chapterFeeToken) {
                this.addNotification('All fields are required.', 5000);
                return;
            }
            const interval = this.parseInterval(this.chapterFeeInterval);
            const amount = this.parseAmount(this.chapterFeeAmount, 18);
            try {
                const tx = await window.web3Logic.deployChapter(this.walletAddress, interval, amount, this.chapterFeeToken);
                this.addNotification('Chapter created, initializing...', 10000);
                await window.web3Logic.nextCycleBill(this.chapterData.address, '', 0, '');
                await this.openChapterModal(tx.events.ChapterDeployed.returnValues.chapter);
            } catch (err) {
                this.addNotification('Chapter creation failed.', 5000);
            }
        },

        parseInterval(input) {
            const weeks = input.match(/(\d+)\s*week/i);
            const months = input.match(/(\d+)\s*month/i);
            if (weeks) return parseInt(weeks[1]) * 604800;
            if (months) return parseInt(months[1]) * 2592000;
            return 0;
        },

        parseAmount(amount, decimals) {
            return BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));
        },

        updateTokenLabel() {
            this.chapterFeeTokenLabel = this.chapterFeeToken === '0x9749156E590d0a8689Bc30F108773D7509D48A84' ? 'LUX' : 'Custom';
        },

        async claimLux() {
            try {
                await window.web3Logic.claimLux();
                this.addNotification('0.01 LUX claimed.', 5000);
                await this.checkLightSourceBalance();
            } catch (err) {
                this.addNotification('Claim failed.', 5000);
            }
        },

        async checkLightSourceBalance() {
            const balance = await window.web3Logic.getLightSourceBalance();
            this.lightSourceBalance = (balance / 10n ** 18n).toString();
        },

        async subscribe() {
            const cycles = prompt('Enter cycles to hear (default 1):', '1');
            if (!cycles || isNaN(cycles) || cycles <= 0) {
                this.addNotification('Invalid cycles.', 5000);
                return;
            }
            try {
                const fee = await window.web3Logic.getChapterFee(this.chapterData.address);
                const token = await window.web3Logic.getChapterToken(this.chapterData.address);
                const amount = BigInt(cycles) * fee;
                const balance = await window.web3Logic.getTokenBalance(token, this.walletAddress);
                if (balance < amount) {
                    this.addNotification(`Insufficient ${token === '0x9749156E590d0a8689Bc30F108773D7509D48A84' ? 'LUX' : 'tokens'}.`, 30000);
                    return;
                }
                await window.web3Logic.approveToken(token, this.chapterData.address, amount);
                this.addNotification('Approval and Subscription are 2 transactions.', 5000);
                await window.web3Logic.hear(this.chapterData.address);
                this.chapterData.isSubscribed = true;
            } catch (err) {
                this.addNotification('Subscription failed.', 5000);
            }
        },

        async unsubscribe() {
            try {
                await window.web3Logic.silence(this.chapterData.address);
                this.chapterData.isSubscribed = false;
            } catch (err) {
                this.addNotification('Unsubscribe failed.', 5000);
            }
        },

        async createLumen() {
            let dataEntry = this.lumenDataEntry;
            if (!this.lumenIsPublic) {
                const key = await this.generatePureCycleKey();
                dataEntry = await this.encryptContent(dataEntry, key);
            }
            try {
                await window.web3Logic.luminate(this.chapterData.address, dataEntry);
                this.lumenDataEntry = '';
                this.chapterData.posts = await this.fetchPosts(this.chapterData.address);
                this.closeModal('lumenCreationModal');
            } catch (err) {
                this.addNotification('Post creation failed.', 5000);
            }
        },

        async generatePureCycleKey() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let key = '';
            for (let i = 0; i < 6; i++) {
                key += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return key;
        },

        async encryptContent(content, key) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(content);
            const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
            return Buffer.from([...iv, ...new Uint8Array(encrypted)]).toString('hex');
        },

        async uploadToCatbox() {
            const files = document.getElementById('catboxFile').files;
            if (!files.length) {
                this.catboxStatus = 'No files selected.';
                return;
            }
            this.catboxStatus = 'Uploading...';
            try {
                for (const file of files) {
                    const formData = new FormData();
                    formData.append('reqtype', 'fileupload');
                    formData.append('fileToUpload', file);
                    const response = await fetch('https://catbox.moe/user/api.php', {
                        method: 'POST',
                        body: formData
                    });
                    if (!response.ok) {
                        throw new Error('Upload failed.');
                    }
                    const url = await response.text();
                    this.lumenDataEntry += `\n${url}`;
                    this.addNotification('You just uploaded to Catbox, consider <a href="https://ko-fi.com/catboxmoe" target="_blank">donating</a>, Catbox is user supported, anonymous and free!', 10000);
                }
                this.catboxStatus = 'Upload complete.';
                this.closeModal('catboxModal');
            } catch (err) {
                this.catboxStatus = 'Upload failed. Try changing DNS to 8.8.8.8.';
                setTimeout(() => this.uploadToCatbox(), 5000); // Retry with backoff
            }
        },

        async updateChapterName() {
            if (this.chapterData.name.length > 100) {
                this.addNotification('Name too long, will not be mapped.', 5000);
            }
            try {
                await window.web3Logic.addChapterName(this.chapterData.address, this.chapterData.name);
                this.chapterData.nameChanged = false;
            } catch (err) {
                this.addNotification('Name update failed.', 5000);
            }
        },

        async updateChapterImage() {
            try {
                await window.web3Logic.addChapterImage(this.chapterData.address, this.chapterData.image);
                this.chapterData.imageChanged = false;
            } catch (err) {
                this.addNotification('Image update failed.', 5000);
            }
        },

        async claimFees() {
            try {
                const cellIndex = localStorage.getItem('lastBilledCell') || 0;
                const hearers = await window.web3Logic.getCellHearers(this.chapterData.address, cellIndex);
                const key = await this.generatePureCycleKey();
                const ownKeys = await Promise.all(hearers.map(async h => {
                    const publicKey = await window.web3Logic.getPublicKey(h);
                    return await this.encryptContent(key, publicKey);
                }));
                await window.web3Logic.nextCycleBill(this.chapterData.address, key, cellIndex, ownKeys.join(','));
                localStorage.setItem('lastBilledCell', cellIndex + 1);
                this.chapterData.pendingFees = '0';
            } catch (err) {
                this.addNotification('Fee claim failed.', 5000);
            }
        },

        async claimRewards() {
            try {
                await window.web3Logic.claimReward();
                this.chapterData.rewards = '0';
            } catch (err) {
                this.addNotification('Reward claim failed.', 5000);
            }
        },

        async mintRewards() {
            try {
                await window.web3Logic.mintRewards();
                this.chapterData.swapCount = 0;
            } catch (err) {
                this.addNotification('Mint rewards failed.', 5000);
            }
        },

        async billLaggards() {
            try {
                const laggards = await window.web3Logic.getLaggards(this.chapterData.address);
                for (const laggard of laggards) {
                    const cycleKeys = await window.web3Logic.getCycleKeys(this.chapterData.address);
                    const decryptedKeys = await Promise.all(cycleKeys.map(k => window.web3Logic.decryptKey(k)));
                    const ownKeys = await Promise.all(decryptedKeys.map(k => this.encryptContent(k, laggard)));
                    await window.web3Logic.billAndSet(this.chapterData.address, laggard, cycleKeys.map((_, i) => i).join(','), ownKeys.join(','));
                }
                this.chapterData.laggards = 0;
            } catch (err) {
                this.addNotification('Laggard billing failed.', 5000);
            }
        },

        async reElect() {
            if (!/^0x[a-fA-F0-9]{40}$/.test(this.chapterData.elect)) {
                this.addNotification('Invalid address.', 5000);
                return;
            }
            if (confirm('You are about to give away control of your chapter. Proceed?')) {
                try {
                    await window.web3Logic.reElect(this.chapterData.address, this.chapterData.elect);
                    this.chapterData.electChanged = false;
                } catch (err) {
                    this.addNotification('Re-elect failed.', 5000);
                }
            }
        },

        addNotification(message, timeout) {
            this.notifications.push({ message, timeout });
            if (timeout > 0) {
                setTimeout(() => {
                    this.notifications = this.notifications.filter(n => n.message !== message);
                }, timeout);
            }
        },

        async startNotificationPolling() {
            setInterval(async () => {
                if (this.walletAddress) {
                    const subscriptions = await window.web3Logic.getHearerChapters(this.walletAddress);
                    for (const chapter of subscriptions) {
                        const fee = await window.web3Logic.getChapterFee(chapter);
                        const cachedFee = localStorage.getItem(`fee_${chapter}`) || fee;
                        if (fee !== cachedFee) {
                            this.addNotification(`Fee changed for ${chapter}: ${fee}`, 30000);
                            localStorage.setItem(`fee_${chapter}`, fee);
                        }
                    }
                }
            }, 60000 + Math.random() * 540000); // 1-10 minutes
        },

        async showSubscriptions() {
            this.userFeed.showSubscriptions = true;
            try {
                const chapters = await window.web3Logic.getHearerChapters(this.walletAddress);
                this.userFeed.subscriptions = await Promise.all(chapters.map(async addr => {
                    const [name, fee, token, allowance] = await Promise.all([
                        window.web3Logic.getChapterName(addr),
                        window.web3Logic.getChapterFee(addr),
                        window.web3Logic.getChapterToken(addr),
                        window.web3Logic.getAllowance(token, this.walletAddress, addr)
                    ]);
                    return { address: addr, name, fee: `${fee} ${await window.web3Logic.getTokenSymbol(token)}`, cyclesLeft: allowance / fee };
                }));
            } catch (err) {
                this.addNotification('Failed to load subscriptions.', 5000);
            }
        },

        async extendSubscription(address) {
            const cycles = prompt('Enter cycles to extend:', '1');
            if (!cycles || isNaN(cycles) || cycles <= 0) {
                this.addNotification('Invalid cycles.', 5000);
                return;
            }
            try {
                const fee = await window.web3Logic.getChapterFee(address);
                const token = await window.web3Logic.getChapterToken(address);
                const amount = BigInt(cycles) * fee;
                await window.web3Logic.approveToken(token, address, amount);
                this.showSubscriptions();
            } catch (err) {
                this.addNotification('Extension failed.', 5000);
            }
        },

        async cutSubscription(address) {
            const cycles = prompt('Enter cycles to cut:', '1');
            if (!cycles || isNaN(cycles) || cycles <= 0) {
                this.addNotification('Invalid cycles.', 5000);
                return;
            }
            try {
                const fee = await window.web3Logic.getChapterFee(address);
                const token = await window.web3Logic.getChapterToken(address);
                const amount = BigInt(cycles) * fee;
                await window.web3Logic.approveToken(token, address, amount);
                this.showSubscriptions();
            } catch (err) {
                this.addNotification('Cut failed.', 5000);
            }
        },

        async cancelSubscription(address) {
            try {
                await window.web3Logic.silence(address);
                this.showSubscriptions();
            } catch (err) {
                this.addNotification('Cancel failed.', 5000);
            }
        },

        async loadMoreFeed() {
            try {
                const chapters = await window.web3Logic.getHearerChapters(this.walletAddress);
                const newPosts = [];
                for (const chapter of chapters.slice(0, 10)) {
                    const posts = await this.fetchPosts(chapter);
                    newPosts.push(...posts.map(p => ({ ...p, chapter })));
                }
                this.userFeed.posts.push(...newPosts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100));
            } catch (err) {
                this.addNotification('Failed to load feed.', 5000);
            }
        }
    }));
});