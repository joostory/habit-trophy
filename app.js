/**
 * HabitTrophy (해빗 트로피) - 30일 습관 도전 PWA
 * Core Application Logic & State Controller
 */

class HabitTrophyApp {
    constructor() {
        this.challenges = [];
        this.trophies = [];
        this.currentScreen = 'dashboard';
        this.selectedChallengeId = null;
        this.selectedTrophyId = null;
        this.selectedDayNum = null;
        this.alarmInterval = null;

        // Configuration
        this.CONFIG = {
            TOTAL_DAYS: 30,
            GOLD_THRESHOLD: 100, // 30 days
            SILVER_THRESHOLD: 80, // 24 days
            BRONZE_THRESHOLD: 70  // 21 days
        };
    }

    // ==========================================
    // 1. Initialization
    // ==========================================
    init() {
        console.log('HabitTrophy initialization started...');
        this.loadData();
        this.registerServiceWorker();
        this.bindEvents();
        this.navigateTo('dashboard');
        this.initNotificationCheck();
        
        // Show test tools if URL hash or query contains 'test' or local dev
        if (window.location.search.includes('test') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            document.getElementById('ff-tester-block').classList.add('active');
        }

        // Trigger Lucide Icon replacement
        lucide.createIcons();
    }

    // Load data from LocalStorage
    loadData() {
        try {
            const storedChallenges = localStorage.getItem('habit_challenges');
            const storedTrophies = localStorage.getItem('habit_trophies');
            
            this.challenges = storedChallenges ? JSON.parse(storedChallenges) : [];
            this.trophies = storedTrophies ? JSON.parse(storedTrophies) : [];
            
            // Clean up potentially corrupted data
            this.challenges.forEach(c => {
                if (!c.checkRecords || c.checkRecords.length === 0) {
                    c.checkRecords = this.generateCheckRecordsTemplate(c.startDate);
                }
            });
        } catch (e) {
            console.error('LocalStorage load failed, resetting empty arrays', e);
            this.challenges = [];
            this.trophies = [];
        }
    }

    // Save data to LocalStorage
    saveData() {
        try {
            localStorage.setItem('habit_challenges', JSON.stringify(this.challenges));
            localStorage.setItem('habit_trophies', JSON.stringify(this.trophies));
        } catch (e) {
            console.error('LocalStorage save failed', e);
        }
    }

    // PWA Service Worker Registration
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then((reg) => {
                        console.log('Service Worker registered successfully with scope:', reg.scope);
                    })
                    .catch((err) => {
                        console.error('Service Worker registration failed:', err);
                    });
            });
        }
    }

    // Bind DOM events
    bindEvents() {
        // Notification permission button
        const notiBtn = document.getElementById('noti-permission-btn');
        if (notiBtn) {
            notiBtn.addEventListener('click', () => this.requestNotificationPermission());
            this.updateNotiBtnState();
        }

        // Memo inputs characters count
        const memoInput = document.getElementById('today-memo-input');
        const charCounter = document.getElementById('char-counter');
        if (memoInput && charCounter) {
            memoInput.addEventListener('input', (e) => {
                const len = e.target.value.length;
                charCounter.textContent = `${len}/100`;
            });
        }

        // Save daily memo button
        const saveMemoBtn = document.getElementById('btn-save-memo');
        if (saveMemoBtn) {
            saveMemoBtn.addEventListener('click', () => this.saveTodayMemo());
        }

        // Delete challenge button
        const deleteBtn = document.getElementById('btn-delete-challenge');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteCurrentChallenge());
        }

        // Re-challenge from trophy modal
        const rechallengeBtn = document.getElementById('btn-rechallenge-trophy');
        if (rechallengeBtn) {
            rechallengeBtn.addEventListener('click', () => this.rechallengeFromTrophy());
        }
    }

    // ==========================================
    // 2. SPA View Routing
    // ==========================================
    navigateTo(screenId) {
        this.currentScreen = screenId;
        
        // Toggle Active screens
        document.querySelectorAll('.app-screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(`screen-${screenId}`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }

        // Update Bottom Nav Highlighting
        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.classList.remove('active');
        });
        
        const activeNav = document.getElementById(`nav-${screenId}`);
        if (activeNav) {
            activeNav.classList.add('active');
        }

        // Re-render components based on route
        if (screenId === 'dashboard') {
            this.renderDashboard();
        } else if (screenId === 'detail') {
            this.selectedDayNum = null;
            this.renderChallengeDetail();
        } else if (screenId === 'trophies') {
            this.renderTrophyRoom();
        }

        // Refresh icons
        lucide.createIcons();
    }

    // ==========================================
    // 3. Challenge CRUD & Operations
    // ==========================================
    
    // Create new empty 30-day records template
    generateCheckRecordsTemplate(startDateStr) {
        const records = [];
        const start = new Date(startDateStr);
        for (let i = 1; i <= this.CONFIG.TOTAL_DAYS; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + (i - 1));
            records.push({
                day: i,
                checked: null, // null=future or pending today, true=completed, false=missed
                memo: '',
                dateStr: date.toISOString().split('T')[0]
            });
        }
        return records;
    }

    showCreateModal() {
        document.getElementById('challenge-form').reset();
        document.getElementById('challenge-id').value = '';
        document.getElementById('modal-title').textContent = '새로운 도전 설계하기';
        document.getElementById('btn-submit-challenge').textContent = '도전 시작하기! 🚀';
        
        const modal = document.getElementById('modal-create-challenge');
        modal.classList.add('active');
    }

    hideCreateModal() {
        const modal = document.getElementById('modal-create-challenge');
        modal.classList.remove('active');
    }

    saveChallenge() {
        const id = document.getElementById('challenge-id').value;
        const name = document.getElementById('input-habit-name').value.trim();
        const resolution = document.getElementById('input-habit-resolution').value.trim() || '나 자신과의 약속!';
        const alarmTime = document.getElementById('input-alarm-time').value;
        const themeColor = document.querySelector('input[name="theme-color"]:checked').value;
        
        if (!name) return;

        const todayStr = this.getTodayDateString();

        if (id) {
            // Edit existing challenge (Only details, dates aren't easily modified)
            const idx = this.challenges.findIndex(c => c.id === id);
            if (idx > -1) {
                this.challenges[idx].name = name;
                this.challenges[idx].resolution = resolution;
                this.challenges[idx].alarmTime = alarmTime;
                this.challenges[idx].themeColor = themeColor;
            }
        } else {
            // Create new 30-day challenge
            const newChallenge = {
                id: 'ch_' + Date.now(),
                name: name,
                resolution: resolution,
                startDate: todayStr,
                checkRecords: this.generateCheckRecordsTemplate(todayStr),
                alarmTime: alarmTime,
                themeColor: themeColor
            };
            this.challenges.push(newChallenge);
        }

        this.saveData();
        this.hideCreateModal();
        this.navigateTo('dashboard');
    }

    deleteCurrentChallenge() {
        if (!this.selectedChallengeId) return;
        
        if (confirm('정말로 이 도전을 포기하고 삭제하시겠습니까?\n작성했던 30일간의 기록이 모두 사라집니다.')) {
            this.challenges = this.challenges.filter(c => c.id !== this.selectedChallengeId);
            this.saveData();
            this.navigateTo('dashboard');
        }
    }

    // Toggle today's checklist success directly from Dashboard card
    toggleTodayCheck(challengeId, event) {
        if (event) event.stopPropagation(); // Prevent card click opening detail screen
        
        const challenge = this.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        const info = this.calculateChallengeTimeline(challenge);
        if (info.isFinished) {
            alert('이 도전은 이미 30일 기간이 끝났습니다. 상세 화면에서 트로피 수여 정산을 받아보세요!');
            return;
        }

        const todayIndex = info.todayDayNum - 1; // 0-indexed
        if (todayIndex < 0 || todayIndex >= this.CONFIG.TOTAL_DAYS) return;

        const record = challenge.checkRecords[todayIndex];
        const isCurrentlyChecked = record.checked === true;

        if (!isCurrentlyChecked) {
            // Check Success
            record.checked = true;
            this.saveData();
            this.renderDashboard();
            this.triggerConfetti(event); // Burst particle fireworks
        } else {
            // Uncheck Success
            if (confirm('오늘 실천 완료 체크를 취소하시겠습니까?')) {
                record.checked = null;
                this.saveData();
                this.renderDashboard();
            }
        }
    }

    // Calculate details like current day number, rate, misses etc.
    calculateChallengeTimeline(challenge) {
        const todayStr = this.getTodayDateString();
        const start = new Date(challenge.startDate);
        const today = new Date(todayStr);
        
        // 1-indexed count of days elapsed since start
        const timeDiff = today.getTime() - start.getTime();
        const daysElapsed = Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;

        let todayDayNum = 0; // The active day index (1-30). 0 means challenge hasn't started (future) or is completed.
        let isFinished = false;

        if (daysElapsed >= 1 && daysElapsed < this.CONFIG.TOTAL_DAYS) {
            todayDayNum = daysElapsed;
        } else if (daysElapsed === this.CONFIG.TOTAL_DAYS) {
            const todayRecord = challenge.checkRecords[this.CONFIG.TOTAL_DAYS - 1];
            if (todayRecord && todayRecord.checked !== null) {
                // 30일차 당일이고 오늘 실천 체크가 끝났다면 즉시 도전 완료 정산 처리
                isFinished = true;
            } else {
                todayDayNum = daysElapsed;
            }
        } else if (daysElapsed > this.CONFIG.TOTAL_DAYS) {
            isFinished = true;
        }

        // Retroactively evaluate skipped past days as 'false' (missed)
        let modified = false;
        challenge.checkRecords.forEach(record => {
            const recordDay = record.day;
            // If day is in the past compared to today, and checked status is still null, mark it missed (false)
            if (recordDay < daysElapsed && record.checked === null) {
                record.checked = false;
                modified = true;
            }
        });
        
        if (modified) {
            this.saveData();
        }

        // Count achievements
        const totalChecked = challenge.checkRecords.filter(r => r.checked === true).length;
        const totalMissed = challenge.checkRecords.filter(r => r.checked === false).length;
        const rate = Math.round((totalChecked / this.CONFIG.TOTAL_DAYS) * 100);

        return {
            daysElapsed,
            todayDayNum,
            isFinished,
            totalChecked,
            totalMissed,
            rate
        };
    }

    // ==========================================
    // 4. Memos / Logs Handler
    // ==========================================
    saveTodayMemo() {
        if (!this.selectedChallengeId) return;
        
        const challenge = this.challenges.find(c => c.id === this.selectedChallengeId);
        if (!challenge) return;

        const info = this.calculateChallengeTimeline(challenge);
        if (info.isFinished) {
            alert('도전이 만료되어 실천 일기를 기록할 수 없습니다.');
            return;
        }

        const todayIndex = info.todayDayNum - 1;
        if (todayIndex < 0) return;

        const memoText = document.getElementById('today-memo-input').value.trim();
        if (!memoText) return;

        // Auto-check today's completion as true when memo is saved, if not checked yet
        if (challenge.checkRecords[todayIndex].checked !== true) {
            challenge.checkRecords[todayIndex].checked = true;
            this.triggerConfetti();
        }

        challenge.checkRecords[todayIndex].memo = memoText;
        this.saveData();

        // UI Reset & Update
        document.getElementById('today-memo-input').value = '';
        document.getElementById('char-counter').textContent = '0/100';
        
        this.renderChallengeDetail();
    }

    // ==========================================
    // 5. Trophy Evaluation & Room Logic
    // ==========================================
    
    // Evaluate if challenge needs trophy room conversion
    evaluateTrophySettle(challenge) {
        const info = this.calculateChallengeTimeline(challenge);
        
        if (!info.isFinished) return; // Only settle when 30-day period completes

        let grade = '';
        let title = '';
        let emoji = '';

        if (info.rate >= this.CONFIG.GOLD_THRESHOLD) {
            grade = 'gold';
            title = '🥇 골드 트로피';
            emoji = '🏆';
        } else if (info.rate >= this.CONFIG.SILVER_THRESHOLD) {
            grade = 'silver';
            title = '🥈 실버 트로피';
            emoji = '🥈';
        } else if (info.rate >= this.CONFIG.BRONZE_THRESHOLD) {
            grade = 'bronze';
            title = '🥉 브론즈 트로피';
            emoji = '🥉';
        } else {
            grade = 'failure';
            title = '🌱 재도전 배지';
            emoji = '🎗️';
        }

        // Show settlement pop-up
        setTimeout(() => {
            let message = '';
            if (grade === 'failure') {
                message = `30일 동안 [${challenge.name}] 도전을 모두 마쳤습니다!\n달성률 ${info.rate}%로 비록 아쉽게 정식 트로피 기준(70%)에는 미치지 못했지만, 30일간 포기하지 않고 노력하신 점이 멋집니다! 👏\n\n확인을 누르면 '재도전 배지'가 지급되며, 언제든지 다시 새롭게 시작할 수 있습니다.`;
            } else {
                message = `🎉 축하합니다! 🎉\n\n30일 동안 꾸준히 노력한 결과,\n달성률 ${info.rate}%로 [${title}]를 획득하셨습니다!\n\n수여된 트로피는 '트로피 룸'에 영구 보관되며, 카드를 터치하여 입체적으로 감상하실 수 있습니다.`;
            }

            alert(message);

            // Filter memos
            const activeMemos = challenge.checkRecords
                .filter(r => r.memo && r.memo.trim() !== '')
                .map(r => ({ day: r.day, memo: r.memo, date: r.dateStr }));

            // Insert into Trophies Collection
            const newTrophy = {
                id: 'tr_' + Date.now(),
                name: challenge.name,
                resolution: challenge.resolution,
                startDate: challenge.startDate,
                endDate: this.getTodayDateString(),
                checkedCount: info.totalChecked,
                rate: info.rate,
                grade: grade,
                themeColor: challenge.themeColor,
                memos: activeMemos
            };
            this.trophies.push(newTrophy);

            // Remove settled challenge from active list
            this.challenges = this.challenges.filter(c => c.id !== challenge.id);
            this.saveData();

            this.navigateTo('trophies');
        }, 300);
    }

    showTrophyDetail(trophyId) {
        const trophy = this.trophies.find(t => t.id === trophyId);
        if (!trophy) return;

        this.selectedTrophyId = trophyId;
        
        let gradeLabel = '골드 등급';
        let gradeClass = 'gold-grade';
        let trophyEmoji = '🏆';
        
        if (trophy.grade === 'silver') {
            gradeLabel = '실버 등급';
            gradeClass = 'silver-grade';
            trophyEmoji = '🥈';
        } else if (trophy.grade === 'bronze') {
            gradeLabel = '브론즈 등급';
            gradeClass = 'bronze-grade';
            trophyEmoji = '🥉';
        } else if (trophy.grade === 'failure') {
            gradeLabel = '도전 완료 배지';
            gradeClass = 'bronze-grade'; // silver-like styling for neutral try again
            trophyEmoji = '🎗️';
        }

        const modalContent = document.getElementById('trophy-detail-content');
        
        // Render timeline memos inside trophy
        let memosHTML = '<h4>실천 메모 기록이 없습니다.</h4>';
        if (trophy.memos && trophy.memos.length > 0) {
            memosHTML = `
                <h4>📝 30일간의 나의 기록들</h4>
                <div class="trophy-memo-timeline">
                    ${trophy.memos.map(m => `
                        <div class="trophy-memo-item">
                            <span class="memo-time-badge">${m.day}일차 (${m.date})</span>
                            <span class="memo-text-content">"${m.memo}"</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        modalContent.innerHTML = `
            <div class="trophy-glow-large ${gradeClass}">
                ${trophyEmoji}
            </div>
            <h2 style="font-size: 22px; text-align: center; margin-top: 10px;">${trophy.name}</h2>
            <p style="color: var(--text-muted); font-size: 13px; text-align: center; font-style: italic;">"${trophy.resolution}"</p>
            
            <span class="trophy-grade-label ${gradeClass}">${gradeLabel}</span>

            <div style="display: flex; justify-content: space-around; width: 100%; margin: 10px 0; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px;">
                <div style="text-align: center;">
                    <p style="font-size: 11px; color: var(--text-muted);">실천 일수</p>
                    <p style="font-size: 16px; font-weight: 700; color: #fff;">${trophy.checkedCount}일 / 30일</p>
                </div>
                <div style="text-align: center;">
                    <p style="font-size: 11px; color: var(--text-muted);">최종 달성률</p>
                    <p style="font-size: 16px; font-weight: 700; color: var(--grade-color, var(--trophy-gold));">${trophy.rate}%</p>
                </div>
            </div>

            <div class="trophy-detail-memos">
                ${memosHTML}
            </div>
        `;

        // Apply theme color styling to grade label dynamically
        const modalElement = document.querySelector('.trophy-modal');
        modalElement.className = `modal-content glass-panel animated-scale-up trophy-modal ${gradeClass}`;
        modalElement.style.borderTopColor = trophy.grade === 'failure' ? 'var(--text-muted)' : `var(--trophy-${trophy.grade})`;

        const modal = document.getElementById('modal-trophy-detail');
        modal.classList.add('active');
    }

    hideTrophyModal() {
        const modal = document.getElementById('modal-trophy-detail');
        modal.classList.remove('active');
    }

    rechallengeFromTrophy() {
        if (!this.selectedTrophyId) return;
        const trophy = this.trophies.find(t => t.id === this.selectedTrophyId);
        if (!trophy) return;

        if (confirm(`🏆 [${trophy.name}] 습관을 복제하여 새로운 30일 도전을 다시 시작하시겠습니까?\n이전의 성공 기록은 트로피 룸에 영구히 보존됩니다.`)) {
            const todayStr = this.getTodayDateString();
            const newChallenge = {
                id: 'ch_' + Date.now(),
                name: trophy.name,
                resolution: trophy.resolution,
                startDate: todayStr,
                checkRecords: this.generateCheckRecordsTemplate(todayStr),
                alarmTime: '20:00', // default alarm
                themeColor: trophy.themeColor
            };
            this.challenges.push(newChallenge);
            this.saveData();
            
            this.hideTrophyModal();
            this.navigateTo('dashboard');
        }
    }

    // ==========================================
    // 6. Web Notification Core
    // ==========================================
    
    // Check & display browser alert button state
    updateNotiBtnState() {
        const notiBtn = document.getElementById('noti-permission-btn');
        if (!notiBtn) return;
        
        if (!('Notification' in window)) {
            notiBtn.style.display = 'none'; // Unsupportive browsers
            return;
        }

        if (Notification.permission === 'granted') {
            notiBtn.style.color = 'var(--neon-emerald)';
            notiBtn.title = '알림 권한: 활성화됨';
        } else if (Notification.permission === 'denied') {
            notiBtn.style.color = 'var(--neon-pink)';
            notiBtn.title = '알림 권한: 차단됨 (클릭하여 다시 허용해 보세요)';
        } else {
            notiBtn.style.color = 'var(--text-muted)';
            notiBtn.title = '알림 받기 설정';
        }
    }

    requestNotificationPermission() {
        if (!('Notification' in window)) {
            alert('이 브라우저는 알림 기능을 지원하지 않습니다.');
            return;
        }

        Notification.requestPermission().then((permission) => {
            this.updateNotiBtnState();
            if (permission === 'granted') {
                // Instantly trigger friendly test alert to verify it works
                new Notification('HabitTrophy', {
                    body: '알림이 성공적으로 등록되었습니다! 매일 실천을 도와드릴게요. 🏆',
                    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f111a%22 rx=%2220%22/><text y=%22.75em%22 x=%22.1em%22 font-size=%2270%22>🏆</text></svg>'
                });
            } else {
                alert('알림 설정이 비활성화되었습니다. 브라우저 설정에서 권한을 수동으로 켜주셔야 일일 리마인더 알림을 받을 수 있습니다.');
            }
        });
    }

    // Local loop running every minute to trigger notifications for user's active challenge times
    initNotificationCheck() {
        if (this.alarmInterval) clearInterval(this.alarmInterval);

        this.alarmInterval = setInterval(() => {
            if (!('Notification' in window) || Notification.permission !== 'granted') return;

            const now = new Date();
            const currentHour = String(now.getHours()).padStart(2, '0');
            const currentMin = String(now.getMinutes()).padStart(2, '0');
            const currentTimeStr = `${currentHour}:${currentMin}`;

            // Search challenges that match the current time
            this.challenges.forEach(challenge => {
                // If it is matching alarm time, and NOT completed today yet
                if (challenge.alarmTime === currentTimeStr) {
                    const info = this.calculateChallengeTimeline(challenge);
                    if (!info.isFinished && info.todayDayNum > 0) {
                        const todayRecord = challenge.checkRecords[info.todayDayNum - 1];
                        if (todayRecord.checked === null) {
                            // Single notification trigger
                            this.dispatchLocalNotification(challenge.name, challenge.resolution);
                        }
                    }
                }
            });
        }, 60000); // Check once every 60 seconds
    }

    dispatchLocalNotification(habitName, resolution) {
        new Notification('습관 실천할 시간입니다! 🏆', {
            body: `[${habitName}] 도전을 이어나갈 시간입니다. "${resolution}"`,
            icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f111a%22 rx=%2220%22/><text y=%22.75em%22 x=%22.1em%22 font-size=%2270%22>🏆</text></svg>',
            tag: 'habit-alarm-' + Date.now()
        });
    }

    // ==========================================
    // 7. Dynamic Renderer Functions
    // ==========================================
    
    // Screen 1: Dashboard Home Renderer
    renderDashboard() {
        const container = document.getElementById('challenges-container');
        const emptyState = document.getElementById('dashboard-empty');
        const activeCount = document.getElementById('active-count');
        
        // Remove old dynamic cards
        document.querySelectorAll('.challenge-card').forEach(el => el.remove());
        
        if (this.challenges.length === 0) {
            emptyState.style.display = 'flex';
            activeCount.textContent = '0개';
            return;
        }

        emptyState.style.display = 'none';
        activeCount.textContent = `${this.challenges.length}개`;

        this.challenges.forEach(challenge => {
            const info = this.calculateChallengeTimeline(challenge);
            
            // Auto check if finished
            if (info.isFinished) {
                // If 30-day period completes, we show it as finished card requiring detail view entry to settle
                this.renderFinishedDashboardCard(challenge, info, container);
            } else {
                this.renderActiveDashboardCard(challenge, info, container);
            }
        });
    }

    renderActiveDashboardCard(challenge, info, parentContainer) {
        const card = document.createElement('div');
        card.className = 'challenge-card glass-panel';
        card.style.setProperty('--theme-color', challenge.themeColor);
        card.style.setProperty('--theme-color-glow', challenge.themeColor + '40'); // 25% opacity glow
        card.onclick = () => {
            this.selectedChallengeId = challenge.id;
            this.navigateTo('detail');
        };

        const todayIndex = info.todayDayNum - 1;
        const isCheckedToday = challenge.checkRecords[todayIndex]?.checked === true;
        const checkBtnClass = isCheckedToday ? 'card-check-today-btn checked' : 'card-check-today-btn';
        const checkBtnText = isCheckedToday ? '실천 완료' : '완료 체크';
        const checkBtnIcon = isCheckedToday ? 'check-circle-2' : 'circle';

        card.innerHTML = `
            <div class="challenge-card-header">
                <div>
                    <h3 class="challenge-card-title">${challenge.name}</h3>
                    <p class="challenge-card-resolution">${challenge.resolution}</p>
                </div>
                <div class="challenge-card-time">
                    <i data-lucide="bell" style="width:11px; height:11px;"></i> ${challenge.alarmTime}
                </div>
            </div>
            
            <div class="card-checklist-summary">
                <span class="achievement-rate">
                    <i data-lucide="zap" style="width:14px; height:14px; fill:var(--theme-color);"></i>
                    달성률 ${info.rate}% (${info.todayDayNum}일차)
                </span>
                
                <button class="${checkBtnClass}" onclick="app.toggleTodayCheck('${challenge.id}', event)">
                    <i data-lucide="${checkBtnIcon}"></i>
                    <span>${checkBtnText}</span>
                </button>
            </div>
            
            <div class="card-progress-bar">
                <div class="card-progress-fill" style="width: ${info.rate}%"></div>
            </div>
        `;

        parentContainer.appendChild(card);
    }

    renderFinishedDashboardCard(challenge, info, parentContainer) {
        const card = document.createElement('div');
        card.className = 'challenge-card glass-panel';
        card.style.setProperty('--theme-color', 'var(--trophy-gold)');
        card.style.setProperty('--theme-color-glow', 'var(--trophy-gold-glow)');
        card.onclick = () => {
            this.selectedChallengeId = challenge.id;
            this.navigateTo('detail');
        };

        card.innerHTML = `
            <div class="challenge-card-header">
                <div>
                    <h3 class="challenge-card-title">${challenge.name}</h3>
                    <p class="challenge-card-resolution">${challenge.resolution}</p>
                </div>
                <span style="font-size:11px; font-weight:800; background:rgba(255,215,0,0.2); color:var(--trophy-gold); padding:2px 8px; border-radius:12px;">도전 완료</span>
            </div>
            
            <div class="card-checklist-summary" style="margin-top:14px;">
                <span class="achievement-rate" style="color: var(--trophy-gold)">
                    <i data-lucide="award" style="width:16px; height:16px;"></i>
                    최종 달성률 ${info.rate}% (30일 완료)
                </span>
                
                <span style="font-size:12px; font-weight:700; color:#fff; display:flex; align-items:center; gap:4px;">
                    정산 받기 <i data-lucide="chevron-right" style="width:14px; height:14px;"></i>
                </span>
            </div>
            
            <div class="card-progress-bar" style="background:rgba(255,215,0,0.05);">
                <div class="card-progress-fill" style="width: 100%; background: linear-gradient(90deg, var(--trophy-gold), #fff);"></div>
            </div>
        `;

        parentContainer.appendChild(card);
    }

    // Screen 2: Challenge Detail & 30-day Calendar Renderer
    renderChallengeDetail() {
        if (!this.selectedChallengeId) {
            this.navigateTo('dashboard');
            return;
        }

        const challenge = this.challenges.find(c => c.id === this.selectedChallengeId);
        if (!challenge) {
            this.navigateTo('dashboard');
            return;
        }

        const info = this.calculateChallengeTimeline(challenge);
        
        // Auto-Trigger trophy conversion screen if challenge finished
        if (info.isFinished) {
            this.evaluateTrophySettle(challenge);
            return;
        }

        // Set default selectedDayNum if not set
        if (this.selectedDayNum === null) {
            this.selectedDayNum = info.todayDayNum > 0 ? info.todayDayNum : this.CONFIG.TOTAL_DAYS;
        }

        // 1. Render Card info Panel
        const cardInfo = document.getElementById('detail-card-info');
        cardInfo.style.setProperty('--theme-color', challenge.themeColor);
        cardInfo.style.setProperty('--theme-color-glow', challenge.themeColor + '40');
        
        const daysRemaining = this.CONFIG.TOTAL_DAYS - info.daysElapsed + 1;
        document.getElementById('detail-days-remaining').textContent = daysRemaining > 0 ? `${daysRemaining}일 남음` : '도전 마감일';

        cardInfo.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h2 style="font-size:20px; font-weight:800;">${challenge.name}</h2>
                    <p style="color: var(--text-muted); font-size:13px; margin-top:4px;">"${challenge.resolution}"</p>
                </div>
                <div class="challenge-card-time" style="background: rgba(0,0,0,0.3)">
                    <i data-lucide="bell" style="width:12px; height:12px;"></i> ${challenge.alarmTime}
                </div>
            </div>

            <div class="detail-days-row">
                <span>시작일: <strong>${challenge.startDate}</strong></span>
                <span>달성률: <strong style="color:var(--theme-color)">${info.rate}%</strong></span>
            </div>
            
            <div class="card-progress-bar" style="margin-top: 14px;">
                <div class="card-progress-fill" style="width: ${info.rate}%"></div>
            </div>
        `;

        // 2. Render 30-Days grid cells
        const grid = document.getElementById('days-grid');
        grid.innerHTML = '';
        
        for (let i = 1; i <= this.CONFIG.TOTAL_DAYS; i++) {
            const record = challenge.checkRecords[i - 1];
            const cell = document.createElement('div');
            
            let statusClass = 'locked'; // default status
            
            if (i === info.todayDayNum) {
                // Today checkable
                statusClass = record.checked === true ? 'completed' : 'today';
            } else if (i < info.daysElapsed) {
                // Past days
                statusClass = record.checked === true ? 'completed' : 'missed';
            } else {
                // Future days
                statusClass = 'locked';
            }

            cell.className = `day-cell ${statusClass}`;
            if (i === this.selectedDayNum) {
                cell.classList.add('selected');
            }
            
            cell.style.setProperty('--theme-color', challenge.themeColor);
            cell.style.setProperty('--theme-color-glow', challenge.themeColor + '40');
            cell.textContent = i;

            // Bind click for past and today's days
            if (i <= info.daysElapsed) {
                cell.onclick = (e) => {
                    e.stopPropagation();
                    this.selectDay(i);
                };
            }

            grid.appendChild(cell);
        }

        // Update memo section title dynamically
        const isTodaySelected = (this.selectedDayNum === info.todayDayNum);
        const titleSuffix = isTodaySelected ? `오늘 (${this.selectedDayNum}일차)` : `${this.selectedDayNum}일차`;
        const memoTitle = document.querySelector('.memo-logs-section h3');
        if (memoTitle) {
            memoTitle.textContent = `${titleSuffix} 실천 일기`;
        }

        // 3. Render Memo Input UI availability
        const memoBlock = document.getElementById('memo-input-block');
        const selectedRecord = challenge.checkRecords[this.selectedDayNum - 1];
        
        if (selectedRecord && selectedRecord.checked === true) {
            // Completed state: show memo content, allow edit or cancel check
            const existingMemo = selectedRecord.memo || '';
            memoBlock.innerHTML = `
                <textarea id="today-memo-input" placeholder="이 날은 일기 기록이 비어있습니다. 실천 소감을 남겨보세요!" maxlength="100">${existingMemo}</textarea>
                <div class="memo-actions" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span class="char-counter" id="char-counter">${existingMemo.length}/100</span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-danger btn-sm" onclick="app.toggleDayCheckState('${challenge.id}', ${this.selectedDayNum}, false)">실천 체크 취소 ✕</button>
                        <button class="btn btn-primary btn-sm" id="btn-save-memo" onclick="app.saveDayMemo('${challenge.id}', ${this.selectedDayNum})">메모 수정 저장 💾</button>
                    </div>
                </div>
            `;
        } else {
            // Missed / Unchecked state: allow checking or checking + memo
            memoBlock.innerHTML = `
                <textarea id="today-memo-input" placeholder="${titleSuffix} 실천하면서 어땠나요? 소감을 적고 완료해 보세요!" maxlength="100"></textarea>
                <div class="memo-actions" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span class="char-counter" id="char-counter">0/100</span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-outline btn-sm" onclick="app.toggleDayCheckState('${challenge.id}', ${this.selectedDayNum}, true)">체크만 완료 🗸</button>
                        <button class="btn btn-accent btn-sm" id="btn-save-memo" onclick="app.saveDayMemo('${challenge.id}', ${this.selectedDayNum})">기록 & 완료 저장 🚀</button>
                    </div>
                </div>
            `;
        }

        // Re-bind counter listener for textarea
        const textInput = document.getElementById('today-memo-input');
        const counter = document.getElementById('char-counter');
        if (textInput && counter) {
            textInput.addEventListener('input', (e) => {
                counter.textContent = `${e.target.value.length}/100`;
            });
        }

        // 4. Render timeline list
        const historyList = document.getElementById('memo-history-list');
        historyList.innerHTML = '';
        
        // Filter out completed records with memos
        const recordsWithMemos = challenge.checkRecords.filter(r => r.checked === true && r.memo);

        if (recordsWithMemos.length === 0) {
            historyList.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:10px 0;">아직 실천 메모가 비어있습니다. 매일 성공 체크 후 기록을 채워보세요.</div>';
        } else {
            recordsWithMemos.reverse().forEach(record => {
                const item = document.createElement('div');
                item.className = 'memo-timeline-item';
                item.style.setProperty('--theme-color', challenge.themeColor);
                item.style.setProperty('--theme-color-glow', challenge.themeColor + '40');
                item.innerHTML = `
                    <div class="memo-time-badge">${record.day}일차 (${record.dateStr})</div>
                    <div class="memo-text-content">"${record.memo}"</div>
                `;
                historyList.appendChild(item);
            });
        }

        lucide.createIcons();
    }

    // Select specific day in detailed view
    selectDay(dayNum) {
        this.selectedDayNum = dayNum;
        this.renderChallengeDetail();
    }

    // Toggle specific day check state (success / missed-uncheck)
    toggleDayCheckState(challengeId, dayNum, targetState) {
        const challenge = this.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        const info = this.calculateChallengeTimeline(challenge);
        
        // Prevent toggling future days
        if (dayNum > info.daysElapsed) {
            alert('아직 오지 않은 미래 날짜는 체크할 수 없습니다!');
            return;
        }

        const record = challenge.checkRecords[dayNum - 1];
        if (!record) return;

        if (targetState) {
            // Set as Completed
            record.checked = true;
            this.triggerConfetti();
        } else {
            // Cancel Completed
            const isToday = (dayNum === info.todayDayNum);
            // If it is today, revert to null (pending), otherwise revert to false (missed)
            record.checked = isToday ? null : false;
        }

        this.saveData();
        this.renderChallengeDetail();
    }

    // Save memo and complete checking for a specific day
    saveDayMemo(challengeId, dayNum) {
        const challenge = this.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        const memoInput = document.getElementById('today-memo-input');
        if (!memoInput) return;

        const memoText = memoInput.value.trim();
        if (!memoText) {
            alert('일기 내용을 입력해 주세요!');
            return;
        }

        const record = challenge.checkRecords[dayNum - 1];
        if (!record) return;

        // Auto-check as completed if not checked yet
        if (record.checked !== true) {
            record.checked = true;
            this.triggerConfetti();
        }

        record.memo = memoText;
        this.saveData();
        this.renderChallengeDetail();
    }

    // Screen 3: Trophy Room Renderer
    renderTrophyRoom() {
        const container = document.getElementById('trophy-container');
        const emptyState = document.getElementById('trophies-empty');
        const activeCount = document.getElementById('trophy-count');
        
        // Clear previous cards
        document.querySelectorAll('.trophy-card').forEach(el => el.remove());

        if (this.trophies.length === 0) {
            emptyState.style.display = 'flex';
            activeCount.textContent = '0개';
            return;
        }

        emptyState.style.display = 'none';
        activeCount.textContent = `${this.trophies.length}개`;

        this.trophies.forEach(trophy => {
            const card = document.createElement('div');
            
            let gradeClass = 'gold-grade';
            let emoji = '🏆';
            
            if (trophy.grade === 'silver') {
                gradeClass = 'silver-grade';
                emoji = '🥈';
            } else if (trophy.grade === 'bronze') {
                gradeClass = 'bronze-grade';
                emoji = '🥉';
            } else if (trophy.grade === 'failure') {
                gradeClass = 'bronze-grade'; // silver-like styling for neutral try again
                emoji = '🎗️';
            }

            card.className = `trophy-card ${gradeClass}`;
            card.onclick = () => this.showTrophyDetail(trophy.id);

            card.innerHTML = `
                <div class="trophy-model-glow">${emoji}</div>
                <div class="trophy-card-title">${trophy.name}</div>
                <div class="trophy-card-grade">${trophy.rate}% 달성</div>
            `;

            container.appendChild(card);
        });
    }

    // ==========================================
    // 8. Visual Particle Confetti Effects
    // ==========================================
    triggerConfetti(clickEvent) {
        // Find click coords if existing, or pick screen center
        let startX = window.innerWidth / 2;
        let startY = window.innerHeight / 2;

        if (clickEvent && clickEvent.clientX && clickEvent.clientY) {
            startX = clickEvent.clientX;
            startY = clickEvent.clientY;
        }

        const canvas = document.createElement('canvas');
        canvas.className = 'confetti-canvas';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        
        // Full screen sizing
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const particleCount = 100;
        const colors = ['#00f2fe', '#9d4edd', '#ff007f', '#05fa95', '#ff7b00', '#ffd700'];

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: startX,
                y: startY,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedX: (Math.random() - 0.5) * 15,
                speedY: (Math.random() - 0.7) * 15 - 5, // vertical velocity burst
                gravity: 0.45,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                opacity: 1
            });
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;

            particles.forEach(p => {
                if (p.opacity <= 0) return;
                
                active = true;
                p.x += p.speedX;
                p.y += p.speedY;
                p.speedY += p.gravity;
                p.rotation += p.rotationSpeed;
                p.opacity -= 0.015;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                
                // Draw star/square confetti shapes
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            });

            if (active) {
                requestAnimationFrame(animateParticles);
            } else {
                canvas.remove(); // garbage collection
            }
        }

        animateParticles();
    }

    // ==========================================
    // 9. Tester Tools & Utilities
    // ==========================================
    
    // Fast-Forward helper (Cheat code to automatically fast-check X days for debugging)
    fastForwardChallenge(daysToComplete) {
        if (!this.selectedChallengeId) {
            alert('대시보드에서 도전과제 카드 하나를 클릭해 "상세 화면"으로 들어간 상태에서 눌러주세요.');
            return;
        }

        const challenge = this.challenges.find(c => c.id === this.selectedChallengeId);
        if (!challenge) return;

        if (confirm(`🧪 테스트용 치트: [${challenge.name}] 도전을 ${daysToComplete}일 성공 상태로 조작하시겠습니까?\n\n* 시작일은 29일 전으로 당겨지고, 29일간 성공 기록과 샘플 일기가 추가됩니다.\n* 즉시 오늘 날짜(30일차)의 체크가 대기 상태로 활성화됩니다.`)) {
            const offset = new Date().getTimezoneOffset() * 60000;
            const start = new Date(Date.now() - offset);
            // Pull starting date 29 days backwards
            start.setDate(start.getDate() - 29);
            const dateStr = start.toISOString().split('T')[0];

            challenge.startDate = dateStr;
            challenge.checkRecords = this.generateCheckRecordsTemplate(dateStr);

            // Populate first X days as checked with sample memo, leaving day 30 empty
            for (let i = 1; i <= this.CONFIG.TOTAL_DAYS; i++) {
                const record = challenge.checkRecords[i - 1];
                if (i <= daysToComplete) {
                    record.checked = true;
                    record.memo = `${i}일째 꾸준히 달리는 중! 🔥`;
                } else if (i < 30) {
                    record.checked = false; // Mark missed if gap
                    record.memo = '';
                } else {
                    record.checked = null; // Today/Final day is checkable
                    record.memo = '';
                }
            }

            this.saveData();
            this.renderChallengeDetail();
        }
    }

    // Helper date string formatted as YYYY-MM-DD local timezone
    getTodayDateString() {
        const offset = new Date().getTimezoneOffset() * 60000;
        return new Date(Date.now() - offset).toISOString().split('T')[0];
    }
}

// Global App Instance
const app = new HabitTrophyApp();
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
