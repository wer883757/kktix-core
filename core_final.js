(function () {
    'use strict';

    let isWaitingForKktixResponse = false;
    const STORAGE_KEY = 'kktix_autostart_state';
    const SETTINGS_KEY = 'kktix_user_pref_settings';
    const FAIL_INDEX_KEY = 'kktix_ans_fail_index';

    let running = (localStorage.getItem(STORAGE_KEY) === 'true');
    let loopId = null;
    const LOOP_INTERVAL = 400;
    const RELOAD_COOLDOWN = 900;
    let lastReload = 0;
    let debug = false;

    const EXCLUDE_KEYWORDS = [
        '愛心', '身障', '輪椅', '優待',
        '未開賣', '暫無票', '已售完', 'Sold Out', '完売'
    ];

    const alarm = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    const $ = id => document.getElementById(id);

    // ======== 攔截系統原生彈窗 ========
    const originalAlert = unsafeWindow.alert;
    unsafeWindow.alert = function (message) {
        if (debug) console.log("攔截到系統彈窗:", message);
        if (!running) return originalAlert(message);

        const warnings = [
            "票券都被選走了", "如果其他用戶沒有完成報名", "不要重新整理頁面",
            "請稍後再試", "沒有可以購買", "單一分頁", "系統繁忙", "糟糕",
            "超過每人購票張數限制", "張數已達上限", "不可重複使用", "邀請碼",
            "錯誤", "不正確", "票券已全部售出", "售出"
        ];

        if (warnings.some(txt => message.includes(txt))) {
            isWaitingForKktixResponse = false;
            unsafeWindow.onbeforeunload = null;

            if (message.includes("不正確") || message.includes("錯誤")) {
                let currentIdx = parseInt(sessionStorage.getItem(FAIL_INDEX_KEY) || '0');
                sessionStorage.setItem(FAIL_INDEX_KEY, currentIdx + 1);
            }

            setTimeout(() => { if (running) window.location.reload(); }, 300);
            return;
        }
        originalAlert(message);
    };

    function forceUnlockUI() {
        document.querySelectorAll('.ng-hide').forEach(el => el.classList.remove('ng-hide'));
        document.querySelectorAll('.btn-disabled-alt').forEach(el => el.classList.remove('btn-disabled-alt'));
        document.querySelectorAll('button[disabled="disabled"]').forEach(el => el.removeAttribute('disabled'));
    }

    function saveSettings() {
        const config = {
            p1: $("p1")?.value || "", p2: $("p2")?.value || "", num: $("num")?.value || "2",
            mode: $("mode")?.value || "random", member: $("member")?.value || "", answer: $("answer")?.value || ""
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
    }

    function loadSettings() {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const config = JSON.parse(saved);
            if (config.p1 && $("p1")) $("p1").value = config.p1;
            if (config.p2 && $("p2")) $("p2").value = config.p2;
            if (config.num && $("num")) $("num").value = config.num;
            if (config.mode && $("mode")) $("mode").value = config.mode;
            if (config.member && $("member")) $("member").value = config.member;
            if (config.answer && $("answer")) $("answer").value = config.answer;
        }
    }

    function optimizeRendering() {
        if (window.location.href.includes('/registrations/new')) {
            const style = document.createElement('style');
            style.innerHTML = `
            img, video, picture { display: none !important; }
            .description-wrapper, .event-description { display: none !important; }
            footer, .footer { display: none !important; }
            `;
            document.head.appendChild(style);
        }
        document.querySelectorAll('iframe').forEach(iframe => {
            if (!iframe.src.includes('recaptcha')) iframe.remove();
        });
    }
    optimizeRendering();

    function updateUIState() {
        const startBtn = $("start");
        const pauseBtn = $("pause");
        if (!startBtn || !pauseBtn) return;
        if (running) {
            startBtn.style.background = "#28a745";
            startBtn.innerText = "▶ 執行中 (監控中)";
            pauseBtn.style.opacity = "1";
        } else {
            startBtn.style.background = "#06f";
            startBtn.innerText = "▶ 啟動";
            pauseBtn.style.opacity = "0.5";
        }
    }

    // ======== GUI 建立 ========
    function initGUI() {
        if (document.getElementById("kenny-panel")) { updateUIState(); return; }
        if (!document.body) { setTimeout(initGUI, 500); return; }

        const container = document.createElement("div");
        container.id = "kenny-panel";
        container.style.cssText = `background:#111; color:#eee; padding:12px; position:fixed; top:10%; right:20px; z-index:999999; width:280px; font-size:16px; border-radius:12px; border:1px solid #666; text-align:left; box-shadow: 0 0 15px rgba(0,0,0,0.5); cursor: default;`;

        container.innerHTML = `
            <h3 id="kenny-header" style="margin:0 0 8px 0; text-align:center; font-size:20px; cursor:move; user-select:none; background:#222; border-radius:6px; padding:4px;"> Kenny KKTIX </h3>
            <label style="display:block;margin:0;">主票價</label>
            <input id="p1" class="pref-input" type="text" placeholder="例：TWD$2,200" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
            <label style="display:block;margin:0;padding-top:6px;">備援票價（空=任意）</label>
            <input id="p2" class="pref-input" type="text" placeholder="例：TWD$1,800" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
            <div style="display:flex; gap:6px; padding-top:6px;">
                <div style="width:50%;">
                    <label style="display:block;margin:0;">張數</label>
                    <select id="num" class="pref-input" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
                        <option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
                    </select>
                </div>
                <div style="width:50%;">
                    <label style="display:block;margin:0;">模式</label>
                    <select id="mode" class="pref-input" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
                        <option value="top">由上而下</option><option value="bottom">由下而上</option><option value="random" selected>隨機</option>
                    </select>
                </div>
            </div>
            <label style="display:block;margin:0;padding-top:6px;">自訂問答(多答案用逗號區隔)</label>
            <input id="answer" class="pref-input" type="text" placeholder="例：A,B,C,YES" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
            <label style="display:block;margin:0;padding-top:6px;">會員編號（可留空）</label>
            <input id="member" class="pref-input" type="text" placeholder="例：BZ583022889" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
            <label style="display:block;margin:0;padding-top:6px;">啟動時間 (空=立即)</label>
            <input id="startTime" type="text" placeholder="HH:MM:SS" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
            <div style="margin-top:12px;">
                <button id="start" style="width:100%;padding:8px;margin-bottom:6px;background:#06f;color:white;font-size:18px;border-radius:6px;border:none;cursor:pointer;"> ▶ 啟動 </button>
                <button id="pause" style="width:100%;padding:8px;background:#c00;color:white;font-size:18px;border-radius:6px;border:none;cursor:pointer;"> ⏸ 暫停 </button>
            </div>
        `;
        document.body.appendChild(container);

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const handle = $("kenny-header");
        handle.onmousedown = (e) => {
            e = e || window.event; e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = (e) => {
                e = e || window.event; e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                container.style.top = (container.offsetTop - pos2) + "px";
                container.style.left = (container.offsetLeft - pos1) + "px";
                container.style.right = "auto";
            };
        };

        document.querySelectorAll(".pref-input").forEach(el => el.addEventListener("input", saveSettings));
        $("start").onclick = () => {
            sessionStorage.setItem(FAIL_INDEX_KEY, '0');
            const T = $("startTime").value.trim();
            if (!T) {
                running = true; localStorage.setItem(STORAGE_KEY, 'true');
                updateUIState(); toast("🚀 立即啟動"); startLoop();
            } else {
                toast("⏳ 排程於: " + T);
                setInterval(() => {
                    if (!running && new Date().toTimeString().slice(0, 8) >= T) {
                        running = true; localStorage.setItem(STORAGE_KEY, 'true');
                        updateUIState(); toast("🔥 時間到，啟動！"); startLoop();
                    }
                }, 200);
            }
        };
        $("pause").onclick = () => {
            running = false; isWaitingForKktixResponse = false;
            localStorage.removeItem(STORAGE_KEY); updateUIState();
            toast("⏸ 暫停中"); stopLoop();
        };
        loadSettings();
        updateUIState();
    }

    function toast(msg) {
        const div = document.createElement("div"); div.innerText = msg;
        div.style.cssText = `position: fixed; top: 15%; right: 20px; z-index: 9999999; background: rgba(0,0,0,0.85); color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 16px; box-shadow: 0 0 8px #000; pointer-events: none;`;
        document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = "0"; setTimeout(() => div.remove(), 400); }, 1500);
    }

    function cleanPrice(priceString) { return priceString ? priceString.replace(/[^0-9]/g, '').trim() : ''; }

    function handleWarningPopups() {
        const warnings = ["票券都被選走了", "如果其他用戶沒有完成報名", "不要重新整理頁面", "請稍後再試", "沒有可以購買", "單一分頁", "系統繁忙", "票券已全部售出", "售出", "糟糕"];
        if (warnings.some(txt => document.body.innerText.includes(txt))) {
            const confirmBtn = Array.from(document.querySelectorAll('button, .btn, a')).find(b => b.offsetParent !== null && ["確定", "確認", "ok"].includes((b.innerText || "").trim().toLowerCase()));
            if (confirmBtn) {
                confirmBtn.click(); isWaitingForKktixResponse = false; unsafeWindow.onbeforeunload = null;
                setTimeout(() => { if (running) window.location.reload(); }, 300); return true;
            }
        } return false;
    }

    function selectTicket() {
        const plusBtns = Array.from(document.querySelectorAll(".plus")).filter(b => b.offsetParent && !b.disabled);
        if (!plusBtns.length) return false;

        const p1Clean = cleanPrice($("p1").value);
        const p2Clean = cleanPrice($("p2").value);
        const num = parseInt($("num").value) || 2;
        const mode = $("mode").value;

        const availablePlus = plusBtns.filter(btn => {
            const row = btn.closest('tr, .display-table-row');
            if (!row) return false;
            const rowText = row.innerText || '';

            if (EXCLUDE_KEYWORDS.some(k => rowText.includes(k))) return false;

            let remaining = 999;
            const matchZh = rowText.match(/剩\s*(\d+)\s*張/);
            const matchEn = rowText.match(/(\d+)\s*Left/i);
            const matchJa = rowText.match(/残り\s*(\d+)\s*枚/);

            if (matchZh) remaining = parseInt(matchZh[1], 10);
            else if (matchEn) remaining = parseInt(matchEn[1], 10);
            else if (matchJa) remaining = parseInt(matchJa[1], 10);

            if (remaining < num) return false;
            return true;
        });

        let foundBtn = null;
        if (p1Clean) foundBtn = availablePlus.find(b => cleanPrice(b.closest('tr, .display-table-row')?.innerText || "").includes(p1Clean));
        if (!foundBtn && p2Clean) foundBtn = availablePlus.find(b => cleanPrice(b.closest('tr, .display-table-row')?.innerText || "").includes(p2Clean));
        if (!foundBtn && !p2Clean && availablePlus.length > 0) {
            if (mode === "bottom") foundBtn = availablePlus[availablePlus.length - 1];
            else if (mode === "random") foundBtn = availablePlus[Math.floor(Math.random() * availablePlus.length)];
            else foundBtn = availablePlus[0];
        }

        // 💡 盲區優化 1：加入 !foundBtn.disabled 判斷，避免超過限購數量引發的錯誤點擊
        if (foundBtn) {
            for (let i = 0; i < num; i++) {
                if (!foundBtn.disabled && !foundBtn.classList.contains('disabled')) {
                    foundBtn.click();
                }
            }
            return true;
        }
        return false;
    }

    function handleEventIndexPage() {
        const enterBtn = document.querySelector('.tickets > a.btn-point, .ticket-actions .btn-point');
        if (enterBtn && !enterBtn.disabled && !enterBtn.classList.contains('disabled')) {
            const btnText = enterBtn.innerText || "";
            if (!btnText.includes('尚未') && !btnText.includes('結束') && !btnText.includes('準備中')) {
                toast("✅ 開賣啦！自動搶進選票畫面！");
                enterBtn.click();
                isWaitingForKktixResponse = true;
                return;
            }
        }

        const now = Date.now();
        if (now - lastReload > RELOAD_COOLDOWN) {
            lastReload = now;
            setTimeout(() => { if (running) window.location.reload(); }, Math.floor(Math.random() * 200));
        }
    }

    function simulateReactAngularInput(el, value) {
        el.focus();
        let nativeInputValueSetter;
        if (el.tagName.toLowerCase() === 'textarea') {
            nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        } else {
            nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        }

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur();
    }

    function handleTicketingPage() {
        if (document.body.innerText.includes("您的訂單已保留") || document.querySelector('.qrcodes') || window.location.href.includes('/orders')) {
            if (running) { running = false; localStorage.removeItem(STORAGE_KEY); updateUIState(); stopLoop(); toast("✅ 成功保留訂單！"); }
            return;
        }

        if (handleWarningPopups()) return;

        const checkbox = document.querySelector('#person_agree_terms, input[id*="agree"]');
        if (checkbox && !checkbox.checked) {
            checkbox.click();
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (!running || isWaitingForKktixResponse) return;

        if (selectTicket()) {
            alarm.play();
            isWaitingForKktixResponse = true;

            // 💡 盲區優化 2：確保如果彈出了 Modal 確認窗，腳本能在 1.5 秒後甦醒，而不是永久卡死
            setTimeout(() => { isWaitingForKktixResponse = false; }, 1500);

            setTimeout(() => {
                const ansRaw = $("answer")?.value.trim();
                const answerInputs = Array.from(document.querySelectorAll('input[type="text"], textarea')).filter(el => {
                    return el.offsetParent !== null &&
                           !el.closest('#kenny-panel') &&
                           !el.classList.contains('member-code') &&
                           !(el.placeholder && el.placeholder.includes('會員')) &&
                           !el.closest('.ticket-quantity');
                });

                if (ansRaw) {
                    const ansList = ansRaw.split(',').map(s => s.trim()).filter(s => s);
                    let currentIdx = parseInt(sessionStorage.getItem(FAIL_INDEX_KEY) || '0');
                    if (currentIdx >= ansList.length) {
                        currentIdx = 0;
                        sessionStorage.setItem(FAIL_INDEX_KEY, '0');
                    }
                    const currentAns = ansList[currentIdx];

                    if (answerInputs.length > 0) {
                        answerInputs.forEach(el => simulateReactAngularInput(el, currentAns));
                    }

                    const choiceInputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]:not(#person_agree_terms):not([id*="agree"])')).filter(el => el.offsetParent !== null);
                    choiceInputs.forEach(input => {
                        const label = input.closest('label') || input.parentElement;
                        if (label && label.innerText.trim().toUpperCase() === currentAns.toUpperCase()) {
                            if (!input.checked) input.click();
                        } else if (label && label.innerText.includes(currentAns)) {
                            if (!input.checked) input.click();
                        }
                    });
                } else {
                    // 💡 盲區優化 3：Python「盲猜」機制移植。若未提供答案，遇到單選題預設選第一個
                    const unboundRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(el => el.offsetParent !== null);
                    if (unboundRadios.length > 0 && !unboundRadios.some(r => r.checked)) {
                        unboundRadios[0].click();
                        if (debug) console.log("觸發 Python 盲猜機制：自動選取第一個 Radio 選項");
                    }
                }

                const mem = $("member").value.trim();
                const memFields = Array.from(document.querySelectorAll('input.member-code, input[placeholder*="會員"]')).filter(el => el.offsetParent !== null);
                if (mem && memFields.length > 0) {
                    memFields.forEach(memField => simulateReactAngularInput(memField, mem));
                }

                if (!ansRaw && !mem) {
                    if (memFields.length > 0 && memFields[0].value === "") {
                        memFields[0].focus();
                    } else if (answerInputs.length > 0 && answerInputs[0].value === "") {
                        answerInputs[0].focus();
                    }
                }

                // 💡 盲區優化 4：擴大抓取「a 標籤」，並支援 Python 的「確認座位」攔截[cite: 9]
                const next = [...document.querySelectorAll('button, input, a')].find(b =>
                    !b.disabled &&
                    !b.classList.contains('disabled') &&
                    b.offsetParent !== null &&
                    (
                        (b.innerText || b.value || "").includes("下一步") ||
                        (b.innerText || b.value || "").includes("配位") ||
                        (b.innerText || b.value || "").includes("確認座位") ||
                        (b.innerText || b.value || "").includes("完成選位")
                    )
                );

                if (next) {
                    next.click();
                } else {
                    const disabledNext = [...document.querySelectorAll('button, input')].find(b => (b.innerText || b.value || "").includes("下一步") || (b.innerText || b.value || "").includes("配位"));
                    if(disabledNext) {
                        disabledNext.removeAttribute('disabled');
                        disabledNext.classList.remove('disabled', 'btn-disabled-alt');
                        disabledNext.click();
                    }
                }
            }, 250);
        } else {
            const now = Date.now();
            if (now - lastReload > RELOAD_COOLDOWN) {
                lastReload = now;
                setTimeout(() => {
                    if (running) window.location.reload();
                }, Math.floor(Math.random() * 200));
            }
        }
    }

    function main() {
        if (!running) return;
        const currentUrl = window.location.href;

        if (currentUrl.includes('/registrations/new')) {
            handleTicketingPage();
        }
        else if (currentUrl.match(/\/events\/[a-zA-Z0-9_-]+\/?$/)) {
            handleEventIndexPage();
        }
    }

    function startLoop() { if (!loopId) loopId = setInterval(() => { if (running) main(); }, LOOP_INTERVAL); }
    function stopLoop() { if (loopId) { clearInterval(loopId); loopId = null; } }

    initGUI();
    if (running) { toast("🔄 自動重啟中"); startLoop(); }
})();
