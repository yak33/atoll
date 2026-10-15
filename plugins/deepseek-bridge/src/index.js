import z from "@deepseek-ai/schemastery";

const name = "atoll-dsh-bridge";

// 依赖 sessions 服务:一来热加载时能补录已存在的会话,二来保证事件源已就绪
const inject = ["sessions"];

const Config = z.object({
	endpoint: z.string().default("http://127.0.0.1:41799"),
	agentName: z.string().default("DeepSeek"),
});

// 事件类型 → 会话状态。未列出的事件与本桥无关,直接忽略。
// approval/asked / approval/decided 是 dsh 独有的精确"等待用户批准"信号。
const EVENT_STATES = {
	"user/message": "working",
	"turn/start": "working",
	"step/start": "working",
	"tool/call": "working",
	"tool/result": "working",
	"assistant/message": "working",
	"approval/asked": "waiting",
	"approval/decided": "working",
	"turn/end": "completed",
};

// 同一状态重复上报的最小间隔(心跳);状态变化不受此限
const HEARTBEAT_MS = 5000;

function apply(ctx, config) {
	// sessionId → 该会话最近状态。更新时先 delete 再 set,
	// 让 Map 迭代序等于"最近活动序",聚合静止态时取末位即可
	const sessionStates = new Map();

	let lastReported = { state: null, at: 0 };

	// dsh 允许多会话并发(子智能体 / 定时任务);聚合规则:
	// 任一 waiting > 任一 working > 最近活动的静止态,避免多会话互相覆盖闪烁
	function aggregate() {
		const states = [...sessionStates.values()];
		if (states.includes("waiting")) return "waiting";
		if (states.includes("working")) return "working";
		return states.at(-1) ?? null;
	}

	function report(state) {
		const now = Date.now();
		if (state === lastReported.state && now - lastReported.at < HEARTBEAT_MS) return;
		lastReported = { state, at: now };
		const url =
			`${config.endpoint}/api/agent/bridge?agent=dsh` +
			`&name=${encodeURIComponent(config.agentName)}&state=${state}`;
		// atoll 未运行属于常态而非错误:静默跳过,恢复后靠下一次心跳接上
		fetch(url, { signal: AbortSignal.timeout(3000) }).catch(() => {});
	}

	function sync() {
		const state = aggregate();
		if (state !== null) report(state);
	}

	function track(sessionId, state) {
		sessionStates.delete(sessionId);
		sessionStates.set(sessionId, state);
		sync();
	}

	ctx.on("session/created", (session) => {
		track(String(session.id), "idle");
	});

	ctx.on("session/disposed", (session) => {
		sessionStates.delete(String(session.id));
		sync();
	});

	ctx.on("session/event", (session, event) => {
		const next = EVENT_STATES[event.type];
		if (next === undefined) return;
		track(String(session.id), next);
	});

	// 本插件可能晚于会话创建才激活(热重载),补录现有会话
	for (const session of ctx.sessions.list()) {
		track(String(session.id), "idle");
	}
}

export { Config, apply, inject, name };
