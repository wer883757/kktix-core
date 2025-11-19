(function(){
  console.log("KKTIX core started");

// ==UserScript==
// @name         Kenny KKTIX v3.1（GUI + 排程搶票 + 自動配位 + 下一步 + 鈴聲 + 自動提示）
// @namespace    https://tampermonkey.net/
// @version      3.1
// @description  GUI搶票、定時啟動、自動選票、自動重整、自動配位、自動下一步、自動填會員、鈴聲通知、自動消失提示
// @match        https://kktix.com/events/*/registrations/new*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let running = false;
    const alarm = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
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
        const plus = document.querySelectorAll(".plus");
        if (!plus.length) return false;

        const p1 = $("p1").value.trim();
        const p2 = $("p2").value.trim();
        const num = parseInt($("num").value);
        const mode = $("mode").value;

        // 主票
        for (const btn of plus) {
            if (btn.closest('.display-table-row')?.innerText.includes(p1)) {
                for (let i = 0; i < num; i++) btn.click();
                return true;
            }
        }

        // 備援票
        if (p2) {
            for (const btn of plus) {
                if (btn.closest('.display-table-row')?.innerText.includes(p2)) {
                    for (let i = 0; i < num; i++) btn.click();
                    return true;
                }
            }
        }

        // 任意票
        if (!p2) {
            const arr = Array.from(plus);
            let btn = arr[0];
            if (mode === "bottom") btn = arr[arr.length - 1];
            if (mode === "random") btn = arr[Math.floor(Math.random() * arr.length)];
            for (let i = 0; i < num; i++) btn.click();
            return true;
        }
        return false;
    }

    // ======== 自動下一步 / 配位 ========
    function clickNextOrAutoSeat() {
        document.querySelector('input[type="checkbox"]')?.click();

        const mem = $("member").value.trim();
        const memField = document.querySelector('input.member-code, input[ng-model*="member_codes"], input[placeholder*="會員"]');
        if (mem && memField) {
            memField.focus();
            memField.value = mem;
            memField.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const auto = [...document.querySelectorAll('button')].find(b => b.innerText.includes("配位"));
        if (auto) return auto.click();

        const next = [...document.querySelectorAll('button,input')].find(b => (b.innerText || b.value || "").includes("下一步"));
        if (next) return next.click();
    }

    // ======== 主流程 ========
    function main() {
        if (!running) return;

        if (selectTicket()) {
            alarm.play();
            setTimeout(clickNextOrAutoSeat, 200);
        } else {
            setTimeout(() => running && location.reload(), 1000);
        }
    }

    // ======== 控制 ========
    $("start").onclick = () => {
        const T = $("startTime").value.trim();
        if (!T) {
            running = true;
            toast("🚀 立即搶票啟動");
            main();
        } else {
            toast("⏳ 設定排程啟動成功");
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
})();




})();
