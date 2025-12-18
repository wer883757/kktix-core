(function(){
  console.log("KKTIX core started");

(function () {
    'use strict';

    let isWaitingForKktixResponse = false;
    const STORAGE_KEY = 'kktix_autostart_state';
    let running = (localStorage.getItem(STORAGE_KEY) === 'true');
    let loopId = null;
    const LOOP_INTERVAL = 400;
    const RELOAD_COOLDOWN = 900;
    let lastReload = 0;
    let debug = false;

    const EXCLUDE_KEYWORDS = ['愛心', '身障', '輪椅', '優待'];

    const alarm = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    const $ = id => document.getElementById(id);

    // ======== 自動消失提示 / Log 保持不變 ========
    function toast(msg) {
        const div = document.createElement("div");
        div.innerText = msg;
        div.style.cssText = `
            position: fixed; top: 15%; right: 20px; z-index: 99999;
            background: rgba(0,0,0,0.85); color: #fff; padding: 10px 16px;
            border-radius: 8px; font-size: 16px; box-shadow: 0 0 8px #000;
        `;
        document.body.appendChild(div);
        setTimeout(() => (div.style.opacity = "0"), 900);
        setTimeout(() => div.remove(), 1300);
    }

    function log(...args) {
        if (debug) console.log("[KKTIX v3.6.22]", ...args);
    }

    // ======== GUI 建立 (大字版 16px) ========
    const panel = document.createElement("div");
    panel.innerHTML = `
    <div id="kenny-panel" style="background:#111;color:#eee;padding:12px;position:fixed;
         top:20%;right:20px;z-index:9999;width:280px;font-size:16px;
         border-radius:12px;border:1px solid #666; text-align:left;">

        <h3 id="kenny-header" style="margin:0 0 8px 0; text-align:center;font-size:20px;">
            Kenny KKTIX
        </h3>

        <label style="display:block;margin:0;">主票價</label>
        <input id="p1" type="text" placeholder="例：TWD$2,200"
            style="width:100%;margin:0;font-size:16px;padding:6px;">

        <label style="display:block;margin:0;padding-top:6px;">備援票價（空=任意）</label>
        <input id="p2" type="text" placeholder="例：TWD$1,800"
            style="width:100%;margin:0;font-size:16px;padding:6px;">

        <label style="display:block;margin:0;padding-top:6px;">張數</label>
        <select id="num" style="width:100%;margin:0;font-size:16px;padding:6px;">
            <option>1</option><option selected>2</option><option>3</option>
            <option>4</option><option>5</option>
        </select>

        <label style="display:block;margin:0;padding-top:6px;">模式</label>
        <select id="mode" style="width:100%;margin:0;font-size:16px;padding:6px;">
            <option value="top">由上而下</option>
            <option value="bottom">由下而上</option>
            <option value="random" selected>隨機</option>
        </select>

        <label style="display:block;margin:0;padding-top:6px;">會員編號（可留空）</label>
        <input id="member" type="text" placeholder="例：BZ583022889"
            style="width:100%;margin:0;font-size:16px;padding:6px;">

        <label style="display:block;margin:0;padding-top:6px;">啟動時間 (空=立即)</label>
        <input id="startTime" type="text" placeholder="HH:MM:SS"
            style="width:100%;margin:0;font-size:16px;padding:6px;">

        <div style="margin-top:12px;">
            <button id="start" style="width:100%;padding:8px;margin-bottom:6px;
                background:#06f;color:white;font-size:18px;border-radius:6px;">
                ▶ 啟動
            </button>

            <button id="pause" style="width:100%;padding:8px;
                background:#c00;color:white;font-size:18px;border-radius:6px;">
                ⏸ 暫停
            </button>
        </div>
    </div>
`;
    document.body.appendChild(panel);

    // header double-click toggle debug
    document.getElementById("kenny-header").addEventListener("dblclick", () => {
        debug = !debug;
        toast(`Debug ${debug ? "ON" : "OFF"}`);
        console.log("[KKTIX v3.6.22] debug:", debug);
    });

    // ======== 核心功能函數定義 (保持不變) ========

    function cleanPrice(priceString) {
        if (!priceString) return '';
        return priceString.replace(/[^0-9]/g, '').trim();
    }

    function detectNotYetOpen() {
        const bodyText = document.body.innerText || "";
        const lower = bodyText.toLowerCase();
        const keywords = ["尚未開賣", "尚未開始", "販售時間", "等待開賣", "即將開賣", "倒數", "尚在準備中", "尚未販售", "未開賣", "尚未開放"];
        for (const k of keywords) {
            if (bodyText.includes(k) || lower.includes(k)) { log("detectNotYetOpen matched:", k); return true; }
        }
        if (/(starts in|countdown|coming soon)/i.test(bodyText)) { log("detectNotYetOpen matched english countdown"); return true; }
        return false;
    }

    function selectTicket() {
        const plusAll = Array.from(document.querySelectorAll(".plus"));
        const plus = plusAll.filter(b => {
            if (!b.offsetParent) return false;
            if (b.disabled) return false;
            if (b.getAttribute("aria-disabled") === "true") return false;
            return true;
        });

        if (!plus.length) { log("selectTicket: no available plus buttons"); return false; }

        const p1Raw = ($("p1")?.value || "").trim();
        const p2Raw = ($("p2")?.value || "").trim();
        const p1Clean = cleanPrice(p1Raw);
        const p2Clean = cleanPrice(p2Raw);
        const num = parseInt(($("num")?.value) || "1", 10) || 1;
        const mode = ($("mode")?.value) || "random";

        let foundBtn = null;

        const availablePlus = plus.filter(btn => {
            const rowElement = btn.closest('tr, .display-table-row, div[role="row"]');
            const rowText = (rowElement?.innerText || '').toLowerCase();

            const isExcluded = EXCLUDE_KEYWORDS.some(keyword => rowText.includes(keyword.toLowerCase()));
            if (isExcluded) {
                log(`Skipping excluded ticket row: ${rowText.trim().substring(0, 30)}...`);
            }
            return !isExcluded;
        });

        if (!availablePlus.length) {
            log("selectTicket: No standard available plus buttons found after exclusion.");
            return false;
        }

        // --- 主票邏輯 ---
        if (p1Clean) {
            for (const btn of availablePlus) {
                const rowElement = btn.closest('tr, .display-table-row, div[role="row"]');
                const rowText = rowElement?.innerText || '';
                if (cleanPrice(rowText).includes(p1Clean)) {
                    foundBtn = btn;
                    log(`selectTicket: found primary price, clicking: ${p1Clean}`);
                    break;
                }
            }
        }

        // --- 備援票邏輯 ---
        if (!foundBtn && p2Clean) {
            for (const btn of availablePlus) {
                const rowElement = btn.closest('tr, .display-table-row, div[role="row"]');
                const rowText = rowElement?.innerText || '';
                if (cleanPrice(rowText).includes(p2Clean)) {
                    foundBtn = btn;
                    log(`selectTicket: found backup price, clicking: ${p2Clean}`);
                    break;
                }
            }
        }

        // --- 任意票邏輯 ---
        if (!foundBtn && !p2Clean) {
            const arr = availablePlus;
            if (arr.length > 0) {
                if (mode === "bottom") foundBtn = arr[arr.length - 1];
                else if (mode === "random") foundBtn = arr[Math.floor(Math.random() * arr.length)];
                else foundBtn = arr[0];
                log("selectTicket: selecting any ticket via mode", mode);
            }
        }

        if (foundBtn) {
            for (let i = 0; i < num; i++) foundBtn.click();
            return true;
        }

        log("selectTicket: no matching standard price found");
        return false;
    }

    function forceReload(reason) {
        running = false;
        stopLoop();
        log(`forceReload: ${reason}, forcing reload...`);
        setTimeout(() => { location.reload(); }, 100);
    }

    function clickNextOrAutoSeat() {
        try {
            document.querySelector('input[type="checkbox"]')?.click();
            const mem = ($("member")?.value || "").trim();
            const memField = document.querySelector('input.member-code, input[ng-model*="member_codes"], input[placeholder*="會員"], input[placeholder*="Member"]');
            if (mem && memField) {
                memField.focus();
                memField.value = mem;
                memField.dispatchEvent(new Event("input", { bubbles: true }));
                log("member code filled:", mem);
            }
            const auto = [...document.querySelectorAll('button')].find(b => /配位|自動配位|auto seat/i.test(b.innerText));
            if (auto) {
                log("clicking auto seat button");
                auto.click();
                isWaitingForKktixResponse = true;
                log("clickNextOrAutoSeat: Auto Seat Clicked, waiting for server response.");
                return;
            }
            const next = [...document.querySelectorAll('button,input')].find(b => (b.innerText || b.value || "").includes("下一步"));
            if (next) {
                log("clicking next button");
                next.click();
                isWaitingForKktixResponse = true;
                log("clickNextOrAutoSeat: Next Button Clicked, waiting for server response.");
            }
        } catch (e) {
            console.error("[KKTIX v3.6.17] clickNextOrAutoSeat error:", e);
        }
    }

    function shouldReload(plusCount) {
        if (detectNotYetOpen()) return true;
        const bodyText = (document.body.innerText || "").toLowerCase();
        if (plusCount === 0 && /(sold out|已售完|無票|無法購買|沒有票)/i.test(bodyText)) { return true; }
        if (plusCount === 0) { return true; }
        const p1 = ($("p1")?.value || "").trim();
        const p2 = ($("p2")?.value || "").trim();
        const isPreSale = detectNotYetOpen();
        const isStuckOnSoldOutPage = !isPreSale && plusCount > 0 && p1 && p2;
        if (isStuckOnSoldOutPage) { return true; }
        return false;
    }

    function main() {
        // 檢查是否已成功進入訂單確認頁，若是則停止腳本
        const orderReservedText = document.body.innerText.includes("您的訂單已保留");
        const cancelButton = [...document.querySelectorAll('button,a')].find(el => el.innerText.includes('取消購買'));

        if (orderReservedText || cancelButton) {
            if (running) {
                running = false;
                localStorage.removeItem(STORAGE_KEY);
                stopLoop();
                toast("✅ 成功保留訂單！腳本已停止。");
                log("Order successfully reserved, script stopped.");
            }
            return;
        }

        if (!running || isWaitingForKktixResponse) return;
        try {
            const plusAll = Array.from(document.querySelectorAll(".plus"));
            const plusVisible = plusAll.filter(b => b.offsetParent && !b.disabled && b.getAttribute("aria-disabled") !== "true");

            // 1. 嘗試選票
            if (selectTicket()) {
                log("main: selectTicket returned true -> play alarm & next step");
                try { alarm.play(); } catch (e) { log("alarm play failed:", e); }
                setTimeout(clickNextOrAutoSeat, 200);
                return;
            }

            // 2. 決定是否重整
            const shouldReloadNow = shouldReload(plusVisible.length);
            const now = Date.now();

            if (shouldReloadNow) {
                if (now - lastReload > RELOAD_COOLDOWN) {
                    lastReload = now;
                    log("main: reloading page (cooldown passed or page needs refresh)");
                    setTimeout(() => { if (running) location.reload(); }, 600 + Math.floor(Math.random() * 300));
                } else {
                    log("main: reload skipped due to cooldown");
                }
            } else {
                log("main: no reload needed, waiting next loop");
            }
        } catch (e) {
            console.error("[KKTIX v3.6.17] main error:", e);
        }
    }

    function startLoop() {
        if (loopId) return;
        loopId = setInterval(() => {
            if (running) main();
            closeCommonPopups();
        }, LOOP_INTERVAL);
        log("loop started, interval:", LOOP_INTERVAL);
    }

    function stopLoop() {
        if (loopId) {
            clearInterval(loopId);
            loopId = null;
            log("loop stopped");
        }
    }

    function closeCommonPopups() {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const bodyText = document.body.innerText || "";
        const isTargetError = bodyText.includes("目前沒有可以購買的票券。");
        const confirmButton = buttons.find(el => /確認|OK|Confirm|Got it/gi.test(el.innerText || "") && el.offsetParent);

        if (confirmButton && isWaitingForKktixResponse) {
            if (isTargetError) {
                confirmButton.click();
                isWaitingForKktixResponse = false;
                log("closeCommonPopups: Target 'No Ticket' error confirmed. Resuming main loop.");
                return;
            }

            confirmButton.click();
            log("closeCommonPopups: General error or browser modal found. Forcing reload.");
            forceReload("Error/Modal encountered after Next click");
            return;
        }

        const reloadConfirm = buttons.find(el => {
            const t = (el.innerText || "").trim();
            return /重新載入|Reload|繼續|Continue/gi.test(t) && el.offsetParent;
        });

        if (reloadConfirm && !isWaitingForKktixResponse) {
            reloadConfirm.click();
            log("closeCommonPopups clicked: browser/system reload confirm button (Non-waiting state).");
            return;
        }

        const closeBtns = buttons.filter(el => {
            const t = (el.innerText || "").trim();
            return /關閉|Close|閉|取消/gi.test(t);
        });

        closeBtns.forEach(b => {
            try {
                if (b.offsetParent) {
                    b.click();
                    log("closeCommonPopups clicked: generic close button", b.innerText);
                }
            } catch (e) { /* ignore */ }
        });
    }

    // [頁面載入時檢查是否需要自動重啟]
    if (running) {
        // 檢查是否已經成功保留訂單
        const orderReservedText = document.body.innerText.includes("您的訂單已保留");
        const cancelButton = [...document.querySelectorAll('button,a')].find(el => el.innerText.includes('取消購買'));

        if (orderReservedText || cancelButton) {
            running = false;
            localStorage.removeItem(STORAGE_KEY); // 清除運行狀態
            toast("✅ 訂單已保留！請手動完成結帳。");
            log("Order already reserved on load, preventing restart.");
            // 不啟動 loop
        } else {
            // 偵測到運行狀態，自動重啟搶票迴圈，實現持續重整
            toast("🔄 檢測到運行狀態，自動重啟搶票迴圈");
            startLoop();
            setTimeout(main, 80);
        }
    }

    // 啟動與暫停邏輯
    $("start").onclick = () => {
        const T = ($("startTime")?.value || "").trim();
        if (!T) {
            running = true;
            localStorage.setItem(STORAGE_KEY, 'true'); // 儲存運行狀態
            toast("🚀 立即搶票啟動");
            startLoop();
            setTimeout(main, 80);
        } else {
            const timer = setInterval(() => {
                if (!running && new Date().toTimeString().slice(0, 8) >= T) {
                    clearInterval(timer);
                    running = true;
                    localStorage.setItem(STORAGE_KEY, 'true'); // 儲存運行狀態
                    toast("🔥 開始搶票！");
                    startLoop();
                    setTimeout(main, 80);
                }
            }, 200);
            toast("⏳ 設定排程啟動成功");
        }
    };

    $("pause").onclick = () => {
        running = false;
        localStorage.removeItem(STORAGE_KEY); // 清除運行狀態
        toast("⏸ 暫停搶票");
    };

})();
