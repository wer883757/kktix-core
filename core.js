(function(){
  console.log("KKTIX core started");

(function () {
    'use strict';
  
    let isWaitingForKktixResponse = false;
    const STORAGE_KEY = 'kktix_autostart_state';
    const SETTINGS_KEY = 'kktix_user_pref_settings';

    let running = (localStorage.getItem(STORAGE_KEY) === 'true');
    let loopId = null;
    const LOOP_INTERVAL = 400;
    const RELOAD_COOLDOWN = 900;
    let lastReload = 0;
    let debug = false;

    const EXCLUDE_KEYWORDS = ['愛心', '身障', '輪椅', '優待'];
    const alarm = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    const $ = id => document.getElementById(id);

    // ======== 自動記憶功能 ========
    function saveSettings() {
        const config = {
            p1: $("p1")?.value || "",
            p2: $("p2")?.value || "",
            num: $("num")?.value || "2",
            mode: $("mode")?.value || "random",
            member: $("member")?.value || ""
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
        }
    }

    // ======== 拖曳功能實現 ========
    function makeDraggable(el, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
            el.style.right = "auto"; // 拖動後取消右側固定
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // ======== GUI 建立 ========
    function initGUI() {
        if (document.getElementById("kenny-panel")) return;
        if (!document.body) { setTimeout(initGUI, 500); return; }

        const container = document.createElement("div");
        container.id = "kenny-panel";
        container.style.cssText = `
            background:#111; color:#eee; padding:12px; position:fixed;
            top:20%; right:20px; z-index:999999; width:280px; font-size:16px;
            border-radius:12px; border:1px solid #666; text-align:left;
            box-shadow: 0 0 15px rgba(0,0,0,0.5); cursor: default;
        `;

        container.innerHTML = `
            <h3 id="kenny-header" style="margin:0 0 8px 0; text-align:center; font-size:20px; cursor:move; user-select:none; background:#222; border-radius:6px; padding:4px;"> Kenny KKTIX </h3>

            <label style="display:block;margin:0;">主票價</label>
            <input id="p1" class="pref-input" type="text" placeholder="例：TWD$2,200" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">

            <label style="display:block;margin:0;padding-top:6px;">備援票價（空=任意）</label>
            <input id="p2" class="pref-input" type="text" placeholder="例：TWD$1,800" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">

            <label style="display:block;margin:0;padding-top:6px;">張數</label>
            <select id="num" class="pref-input" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
                <option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
            </select>

            <label style="display:block;margin:0;padding-top:6px;">模式</label>
            <select id="mode" class="pref-input" style="width:100%;margin:0;font-size:16px;padding:6px;box-sizing:border-box;">
                <option value="top">由上而下</option><option value="bottom">由下而上</option><option value="random" selected>隨機</option>
            </select>

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

        makeDraggable(container, $("kenny-header"));
        bindEvents();
        loadSettings();
    }

    function bindEvents() {
        document.querySelectorAll(".pref-input").forEach(el => el.addEventListener("input", saveSettings));
        $("kenny-header").addEventListener("dblclick", () => { debug = !debug; toast(`Debug ${debug ? "ON" : "OFF"}`); });

        $("start").onclick = () => {
            const T = $("startTime").value.trim();
            if (!T) {
                running = true; localStorage.setItem(STORAGE_KEY, 'true'); toast("🚀 立即啟動"); startLoop();
            } else {
                toast("⏳ 排程於: " + T);
                setInterval(() => { if (!running && new Date().toTimeString().slice(0, 8) >= T) { running = true; localStorage.setItem(STORAGE_KEY, 'true'); toast("🔥 時間到，啟動！"); startLoop(); } }, 200);
            }
        };

        $("pause").onclick = () => { running = false; localStorage.removeItem(STORAGE_KEY); toast("⏸ 暫停中"); stopLoop(); };
    }

    // ======== 核心邏輯 ========
    function toast(msg) {
        const div = document.createElement("div");
        div.innerText = msg;
        div.style.cssText = `position: fixed; top: 15%; right: 20px; z-index: 9999999; background: rgba(0,0,0,0.85); color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 16px; box-shadow: 0 0 8px #000;`;
        document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = "0"; setTimeout(() => div.remove(), 400); }, 900);
    }

    function cleanPrice(priceString) { return priceString ? priceString.replace(/[^0-9]/g, '').trim() : ''; }

    function selectTicket() {
        const plus = Array.from(document.querySelectorAll(".plus")).filter(b => b.offsetParent && !b.disabled);
        if (!plus.length) return false;

        const p1Clean = cleanPrice($("p1").value);
        const p2Clean = cleanPrice($("p2").value);
        const num = parseInt($("num").value) || 2;
        const mode = $("mode").value;

        const availablePlus = plus.filter(btn => !EXCLUDE_KEYWORDS.some(k => (btn.closest('tr, .display-table-row')?.innerText || '').includes(k)));

        let foundBtn = null;
        if (p1Clean) foundBtn = availablePlus.find(b => cleanPrice(b.closest('tr, .display-table-row')?.innerText || "").includes(p1Clean));
        if (!foundBtn && p2Clean) foundBtn = availablePlus.find(b => cleanPrice(b.closest('tr, .display-table-row')?.innerText || "").includes(p2Clean));
        if (!foundBtn && !p2Clean && availablePlus.length > 0) {
            if (mode === "bottom") foundBtn = availablePlus[availablePlus.length - 1];
            else if (mode === "random") foundBtn = availablePlus[Math.floor(Math.random() * availablePlus.length)];
            else foundBtn = availablePlus[0];
        }

        if (foundBtn) { for (let i = 0; i < num; i++) foundBtn.click(); return true; }
        return false;
    }

    function main() {
        if (document.body.innerText.includes("您的訂單已保留")) {
            if (running) { running = false; localStorage.removeItem(STORAGE_KEY); stopLoop(); toast("✅ 成功保留訂單！"); }
            return;
        }
        if (!running || isWaitingForKktixResponse) return;
        if (selectTicket()) {
            alarm.play();
            setTimeout(() => {
                document.querySelector('input[type="checkbox"]')?.click();
                const mem = $("member").value.trim();
                const memField = document.querySelector('input.member-code');
                if (mem && memField) { memField.value = mem; memField.dispatchEvent(new Event("input", { bubbles: true })); }
                const next = [...document.querySelectorAll('button,input')].find(b => (b.innerText || b.value || "").includes("下一步") || (b.innerText || b.value || "").includes("配位"));
                if (next) { next.click(); isWaitingForKktixResponse = true; }
            }, 200);
        } else {
            const bodyText = document.body.innerText;
            if (bodyText.includes("尚未開賣") || document.querySelectorAll(".plus").length === 0) {
                const now = Date.now();
                if (now - lastReload > RELOAD_COOLDOWN) { lastReload = now; setTimeout(() => { if (running) location.reload(); }, 600); }
            }
        }
    }

    function startLoop() { if (!loopId) loopId = setInterval(() => { if (running) main(); }, LOOP_INTERVAL); }
    function stopLoop() { if (loopId) { clearInterval(loopId); loopId = null; } }

    initGUI();
    if (running) { toast("🔄 自動重啟中"); startLoop(); }
})();
  
})();
