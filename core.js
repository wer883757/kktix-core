(function(){
  console.log("KKTIX core started");

(function () {
    'use strict';

    let running = false;
    const alarm = new Audio("https://actions.google.com/sounds/v1/alarms/medium_bell_ringing_near.ogg");
    const $ = id => document.getElementById(id);

    // ======== 自動消失提示 ========
    function toast(msg) {
        const div = document.createElement("div");
        div.innerText = msg;
        div.style.cssText = `
            position: fixed; top: 15%; right: 20px; z-index: 99999;
            background: rgba(0,0,0,0.85); color: #fff; padding: 10px 16px;
            border-radius: 8px; font-size: 16px; box-shadow: 0 0 8px #000;
            transition: opacity .4s;
        `;
        document.body.appendChild(div);
        setTimeout(() => (div.style.opacity = "0"), 900);
        setTimeout(() => div.remove(), 1300);
    }

    // ======== GUI 建立 ========
    const panel = document.createElement("div");
    panel.innerHTML = `
        <div style="background:#111;color:#eee;padding:12px;position:fixed;top:20%;right:20px;z-index:9999;width:260px;
             font-size:14px;border-radius:10px;border:1px solid #666;">
            <h3 style="margin-top:0;text-align:center;font-size:18px;">🎫 Kenny KKTIX</h3>

            <label>主票價</label>
            <input id="p1" type="text" placeholder="例：TWD$2,200" style="width:100%;margin-bottom:6px">

            <label>備援票價（空=任意）</label>
            <input id="p2" type="text" placeholder="例：TWD$1,800" style="width:100%;margin-bottom:6px">

            <label>張數</label>
            <select id="num" style="width:100%;margin-bottom:6px">
                <option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option>
            </select>

            <label>模式</label>
            <select id="mode" style="width:100%;margin-bottom:6px">
                <option value="top">由上而下</option>
                <option value="bottom">由下而上</option>
                <option value="random" selected>隨機</option>
            </select>

            <label>會員編號（可留空）</label>
            <input id="member" type="text" placeholder="例：BZ583022889" style="width:100%;margin-bottom:6px">

            <label>啟動時間 (空=立即)</label>
            <input id="startTime" type="text" placeholder="HH:MM:SS" style="width:100%;margin-bottom:10px">

            <button id="start" style="width:100%;padding:6px;margin-bottom:6px;background:#06f;color:white;font-size:16px;border-radius:5px;">▶ 啟動</button>
            <button id="pause" style="width:100%;padding:6px;background:#c00;color:white;font-size:16px;border-radius:5px;">⏸ 暫停</button>
        </div>
    `;
    document.body.appendChild(panel);

    // ======== 選票 ========
    function selectTicket() {
        // 找到加號 / 增加票數按鈕（原先 v3.1 用的是 .plus）
        const plus = document.querySelectorAll(".plus, .js-add-ticket, button.add-ticket, .ticket-plus");
        if (!plus || plus.length === 0) return false;

        const p1 = ($("p1")?.value || "").trim();
        const p2 = ($("p2")?.value || "").trim();
        const num = parseInt(($("num")?.value) || "1", 10);
        const mode = ($("mode")?.value) || "random";

        // helper: 從按鈕往上找包含票價文字的列
        const rowText = (btn) => btn.closest('.display-table-row, .ticket-unit, .ticket-row, .row, li')?.innerText || btn.closest('tr')?.innerText || "";

        // 1) 嘗試找主票價
        if (p1) {
            for (const btn of plus) {
                if (rowText(btn).includes(p1)) {
                    for (let i = 0; i < num; i++) {
                        try { btn.click(); } catch (e) {}
                    }
                    toast("🎯 選到主票：" + p1);
                    return true;
                }
            }
        }

        // 2) 找備援票價
        if (p2) {
            for (const btn of plus) {
                if (rowText(btn).includes(p2)) {
                    for (let i = 0; i < num; i++) {
                        try { btn.click(); } catch (e) {}
                    }
                    toast("🛡 選到備援票：" + p2);
                    return true;
                }
            }
        }

        // 3) 任意票（備援空白時）
        if (!p2) {
            const arr = Array.from(plus);
            if (!arr.length) return false;
            let btn = arr[0];
            if (mode === "bottom") btn = arr[arr.length - 1];
            if (mode === "random") btn = arr[Math.floor(Math.random() * arr.length)];
            for (let i = 0; i < num; i++) {
                try { btn.click(); } catch (e) {}
            }
            toast("🔀 選到任意票 (mode:" + mode + ")");
            return true;
        }

        return false;
    }

    // ======== 自動下一步 / 配位 ========
    function clickNextOrAutoSeat() {
        // 勾選條款 checkbox（若有）
        const chk = document.querySelector('input[type="checkbox"], input[type="checkbox"].js-accept, input[name*="agree"]');
        if (chk && !chk.checked) {
            try { chk.click(); } catch (e) {}
        }

        // 填會員編號（若欄位存在）
        const mem = ($("member")?.value || "").trim();
        const memField = document.querySelector('input.member-code, input[ng-model*="member_codes"], input[placeholder*="會員"], input[name*="member"], input[id*="member"]');
        if (mem && memField) {
            memField.focus();
            memField.value = mem;
            memField.dispatchEvent(new Event("input", { bubbles: true }));
            toast("🔢 已填會員：" + mem);
        }

        // 嘗試自動配位按鈕
        const auto = [...document.querySelectorAll('button, a')].find(b => (b.innerText || "").includes("配位"));
        if (auto) { try { auto.click(); } catch (e) {} ; return; }

        // 嘗試下一步按鈕
        const next = [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')].find(b => {
            const text = (b.innerText || b.value || "").trim();
            return text.includes("下一步") || text.includes("下一") || text.includes("下一頁") || text.includes("Proceed") || text.includes("Next");
        });
        if (next) { try { next.click(); } catch (e) {} ; return; }
    }

    // ======== 偵測彈窗 → 自動按確認 → 自動續跑 ========
    function handlePopup() {
        // 常見 modal / sweetalert / 自訂按鈕
        const candidates = Array.from(document.querySelectorAll("button, a, .swal-button, .modal-footer button, .btn, .btn-primary, .dialog-button"));
        const btn = candidates.find(b => {
            const t = (b.innerText || b.value || "").trim();
            if (!t) return false;
            return /(確認|確定|OK|我知道了|知道了|關閉|關閉視窗|返回|取消|了解)/i.test(t);
        });

        if (btn) {
            toast("⚠️ 偵測到提示視窗 → 自動按確認 (" + (btn.innerText || btn.value || "").trim() + ")");
            try { btn.click(); } catch (e) {}
            // 等一小段時間讓 DOM 更新，再回到主流程
            setTimeout(() => { if (running) main(); }, 300);
            return true;
        }

        // 有些彈窗不是 button (例如 native alert) — 監聽並嘗試關閉 overlay
        const modal = document.querySelector('.modal, .swal-modal, .dialog, .notice, .kktix-modal');
        if (modal && window.getComputedStyle(modal).display !== 'none') {
            // 嘗試找 modal 裡的關閉 X
            const closeX = modal.querySelector('.close, .modal-close, .swal-close, .dialog-close, .btn-close');
            if (closeX) {
                try { closeX.click(); } catch (e) {}
                setTimeout(() => { if (running) main(); }, 300);
                toast("⚠️ 偵測 modal → 自動關閉");
                return true;
            }
        }

        return false;
    }

    // ======== 主流程 ========
    function main() {
        if (!running) return;

        // 先處理可能跳出的訊息
        if (handlePopup()) return;

        // 選票 / 下一步 / 或重新整理
        if (selectTicket()) {
            try { alarm.play(); } catch (e) {}
            setTimeout(clickNextOrAutoSeat, 200);
        } else {
            setTimeout(() => { if (running) location.reload(); }, 1000);
        }
    }

    // ======== 控制 ========
    $("start").onclick = () => {
        const T = ($("startTime")?.value || "").trim();
        if (!T) {
            running = true;
            toast("🚀 立即搶票啟動");
            main();
        } else {
            toast("⏳ 設定排程啟動成功：" + T);
            const timer = setInterval(() => {
                if (!running && new Date().toTimeString().slice(0, 8) >= T) {
                    clearInterval(timer);
                    running = true;
                    toast("🔥 開始搶票！");
                    main();
                }
            }, 200);
        }
    };

    $("pause").onclick = () => {
        running = false;
        toast("⏸ 暫停搶票");
    };

    // ======== 额外：監聽 DOM 變化以便更快處理彈窗（可選） ========
    const observer = new MutationObserver(() => {
        if (!running) return;
        // 若發現可能的 popup，就馬上處理
        handlePopup();
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();


})();
