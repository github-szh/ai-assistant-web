<template>
  <div class="mon-page">
    <div class="top-bar">
      <h2>📊 监控面板</h2>
      <div class="top-actions">
        <span class="refresh-hint" v-if="nextRefresh > 0">{{ nextRefresh }}s 后刷新</span>
        <button class="btn-export" @click="exportCsv" v-if="data.recent?.length">导出 CSV</button>
        <router-link to="/chat" class="nav-link">💬 返回对话</router-link>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar">
      <span v-for="tab in tabs" :key="tab.key" class="tab" :class="{active: activeTab === tab.key}" @click="activeTab = tab.key">{{ tab.label }}</span>
    </div>

    <!-- ═══ Tab: 概览 ═══ -->
    <div v-if="activeTab === 'overview'">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">CPU 使用率</div>
          <div class="stat-value" :class="{warn: data.cpu > 80}">{{ data.cpu ?? '-' }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">内存</div>
          <div class="stat-value">{{ fmtMem(data.mem_used) }}<span class="stat-sub">/ {{ fmtMem(data.mem_total) }}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">磁盘使用</div>
          <div class="stat-value">{{ fmtDisk(data.disks) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">DB 连接池</div>
          <div class="stat-value">{{ data.db_pool?.avail ?? '-' }}<span class="stat-sub">/ {{ data.db_pool?.max ?? '-' }}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">LLM 调用 (累计)</div>
          <div class="stat-value">{{ fmtNum(data.llm_call_count ?? llmTotalTokens) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">LLM 总成本</div>
          <div class="stat-value">¥{{ fmtCost(llmTotalCost) }}</div>
        </div>
      </div>

      <div class="chart-row">
        <div class="chart-box">
          <h3>响应延迟百分位</h3>
          <div v-if="hasLatency" class="gpu-info">
            <div class="gpu-row"><span class="bar-label">p50</span><span>{{ (data.latency?.p50 * 1000).toFixed(0) }}ms</span></div>
            <div class="gpu-row"><span class="bar-label">p95</span><span>{{ (data.latency?.p95 * 1000).toFixed(0) }}ms</span></div>
            <div class="gpu-row"><span class="bar-label">p99</span><span>{{ (data.latency?.p99 * 1000).toFixed(0) }}ms</span></div>
          </div>
          <div v-else class="chart-empty">暂无请求数据</div>
        </div>
        <div class="chart-box">
          <h3>GPU</h3>
          <div v-if="gpuName" class="gpu-info">
            <div class="gpu-row"><span class="bar-label">型号</span><span>{{ gpuName }}</span></div>
            <div class="gpu-row"><span class="bar-label">利用率</span><span>{{ data.gpu?.['gpu_0_util'] ?? '-' }}%</span></div>
            <div class="gpu-row"><span class="bar-label">显存</span><span>{{ fmtBytes(data.gpu?.['gpu_0_mem_used']) }} / {{ fmtBytes(data.gpu?.['gpu_0_mem_total']) }}</span></div>
            <div class="gpu-row"><span class="bar-label">温度</span><span>{{ data.gpu?.['gpu_0_temp'] ?? '-' }}°C</span></div>
          </div>
          <div v-else class="chart-empty">无 GPU 或 pynvml 未安装</div>
        </div>
        <div class="chart-box">
          <h3>Redis</h3>
          <div v-if="hasRedis" class="gpu-info">
            <div class="gpu-row"><span class="bar-label">已用内存</span><span>{{ fmtBytes(data.redis?.used_memory) }}</span></div>
            <div class="gpu-row"><span class="bar-label">连接数</span><span>{{ data.redis?.connected_clients ?? '-' }}</span></div>
            <div class="gpu-row"><span class="bar-label">驱逐 Key</span><span>{{ data.redis?.evicted_keys ?? '0' }}</span></div>
            <div class="gpu-row"><span class="bar-label">命中率</span><span>{{ data.redis?.keyspace_hitrate != null ? (data.redis.keyspace_hitrate * 100).toFixed(1) + '%' : '-' }}</span></div>
          </div>
          <div v-else class="chart-empty">Redis 未连接</div>
        </div>
      </div>
    </div>

    <!-- ═══ Tab: 质量 ═══ -->
    <div v-if="activeTab === 'quality'">
      <div class="chart-row">
        <div class="chart-box">
          <h3>RAG 检索质量 (近7天)</h3>
          <div v-if="hasRag" class="rag-cards">
            <div class="rag-card"><span class="bar-label">平均分</span><span class="rag-val">{{ (data.rag?.avg_score * 100).toFixed(1) }}%</span></div>
            <div class="rag-card"><span class="bar-label">总查询</span><span class="rag-val">{{ data.rag?.total ?? 0 }}</span></div>
          </div>
          <div v-if="hasRag && ragBuckets.length" class="chart-bars" style="margin-top:12px">
            <div v-for="b in ragBuckets" :key="b.name" class="bar-row">
              <span class="bar-label">{{ b.label }}</span>
              <div class="bar-track"><div class="bar-fill" :class="b.cls" :style="{width: pct(b.count, ragTotal) + '%'}"></div></div>
              <span class="bar-val">{{ b.count }}</span>
            </div>
          </div>
          <div v-else class="chart-empty">暂无 RAG 查询数据</div>
        </div>
        <div class="chart-box">
          <h3>检索质量分布</h3>
          <div v-if="hasRag" class="rag-pies">
            <div v-for="b in ragBuckets" :key="b.name" class="pie-row">
              <span class="pie-dot" :class="b.cls"></span>
              <span class="bar-label" style="width:auto">{{ b.label }}</span>
              <span class="bar-val" style="width:auto">{{ b.count }} 次</span>
              <span class="bar-val" style="width:auto;color:#909399">({{ ragTotal ? (b.count / ragTotal * 100).toFixed(0) : 0 }}%)</span>
            </div>
          </div>
          <div v-else class="chart-empty">暂无数据</div>
        </div>
      </div>
    </div>

    <!-- ═══ Tab: 性能 ═══ -->
    <div v-if="activeTab === 'performance'">
      <div class="chart-row">
        <div class="chart-box">
          <h3>HTTP 请求 (按端点)</h3>
          <div v-if="httpChart.length" class="chart-bars">
            <div v-for="item in httpChart" :key="item.name" class="bar-row">
              <span class="bar-label">{{ item.name }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{width: pct(item.count, httpMax) + '%'}"></div></div>
              <span class="bar-val">{{ item.count }}</span>
            </div>
          </div>
          <div v-else class="chart-empty">暂无数据</div>
        </div>
        <div class="chart-box">
          <h3>LLM Tokens (按模型)</h3>
          <div v-if="tokenChart.length" class="chart-bars">
            <div v-for="item in tokenChart" :key="item.name" class="bar-row">
              <span class="bar-label">{{ item.name }}</span>
              <div class="bar-track"><div class="bar-fill tk" :style="{width: pct(item.count, tokenMax) + '%'}"></div></div>
              <span class="bar-val">{{ fmtNum(item.count) }}</span>
            </div>
          </div>
          <div v-else class="chart-empty">暂无数据</div>
        </div>
      </div>
      <div class="chart-row">
        <div class="chart-box">
          <h3>LLM 成本 (按模型)</h3>
          <div v-if="costChart.length" class="chart-bars">
            <div v-for="item in costChart" :key="item.name" class="bar-row">
              <span class="bar-label">{{ item.name }}</span>
              <div class="bar-track"><div class="bar-fill ct" :style="{width: pct(item.cost, costMax) + '%'}"></div></div>
              <span class="bar-val">¥{{ fmtCost(item.cost) }}</span>
            </div>
          </div>
          <div v-else class="chart-empty">暂无数据</div>
        </div>
        <div class="chart-box">
          <h3>磁盘使用</h3>
          <div v-if="diskChart.length" class="chart-bars">
            <div v-for="item in diskChart" :key="item.name" class="bar-row">
              <span class="bar-label">{{ item.name }}</span>
              <div class="bar-track"><div class="bar-fill ds" :style="{width: pct(item.pct, 100) + '%'}"></div></div>
              <span class="bar-val">{{ item.used }} / {{ item.total }}</span>
            </div>
          </div>
          <div v-else class="chart-empty">暂无数据</div>
        </div>
      </div>
    </div>

    <!-- ═══ Tab: 明细 ═══ -->
    <div v-if="activeTab === 'details'">
      <div class="section-title">📞 最近 LLM 调用</div>
      <div v-if="data.recent?.length" class="call-table-wrap">
        <table class="call-table">
          <thead><tr><th>时间</th><th>Provider</th><th>模型</th><th>输入 Tokens</th><th>输出 Tokens</th><th>耗时</th><th>成本</th></tr></thead>
          <tbody>
            <tr v-for="(c,i) in data.recent" :key="i">
              <td>{{ fmtTs(c.t) }}</td>
              <td>{{ c.provider }}</td>
              <td>{{ c.model }}</td>
              <td>{{ fmtNum(c.prompt) }}</td>
              <td>{{ fmtNum(c.completion) }}</td>
              <td>{{ c.elapsed ? (c.elapsed + 's') : '-' }}</td>
              <td>¥{{ Number(c.cost).toFixed(4) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">暂无 LLM 调用记录</div>
    </div>

    <!-- ═══ Tab: 告警 ═══ -->
    <div v-if="activeTab === 'alerts'">
      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>🔔 告警历史</span>
        <button class="btn-export" @click="ackAll" v-if="unackedAlerts > 0" style="font-size:12px;padding:4px 10px">全部确认</button>
      </div>
      <div v-if="data.alerts?.length" class="call-table-wrap">
        <table class="call-table">
          <thead><tr><th>时间</th><th>规则</th><th>指标</th><th>当前值</th><th>阈值</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="a in data.alerts" :key="a.id" :class="{alert_unack: !a.acknowledged}">
              <td>{{ fmtTs(a.ts) }}</td>
              <td>{{ a.label }}</td>
              <td>{{ a.metric }}</td>
              <td>{{ a.value }}</td>
              <td>{{ a.operator === 'gt' ? '>' : '<' }} {{ a.threshold }}</td>
              <td>{{ a.acknowledged ? '已确认' : '未确认' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">暂无告警记录</div>
    </div>

    <!-- ═══ Tab: 链路追踪 ═══ -->
    <div v-if="activeTab === 'traces'">
      <div class="section-title">🔄 Arize Phoenix 链路追踪</div>
      <div v-if="phoenixRunning" class="phoenix-open">
        <p style="margin-bottom:16px;color:#606266">Phoenix 正在运行，点击下方按钮在独立窗口中打开：</p>
        <a :href="phoenixUrl" target="_blank" class="btn-phoenix" rel="noopener noreferrer">🔄 打开 Phoenix 链路追踪</a>
        <p style="margin-top:16px;font-size:12px;color:#909399">
          提示：Phoenix 限制 iframe 嵌入，故使用独立窗口显示。<br>
          如果页面没有自动加载，请确保没有端口冲突。
        </p>
      </div>
      <div v-else class="empty">
        <p>Phoenix 未运行</p>
        <p style="font-size:12px;color:#909399">启动后可查看每次 LLM 调用的完整链路详情：</p>
        <pre style="display:inline-block;background:#f5f7fa;padding:8px 16px;border-radius:6px;font-size:13px">python scripts/start_phoenix.py</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../api'

const data = ref<any>({})
let timer: number | null = null
const nextRefresh = ref(0)

const activeTab = ref('overview')
const phoenixRunning = ref(false)
const phoenixUrl = ref('http://localhost:6006')

async function checkPhoenix() {
  try {
    const r = await api.get('/api/phoenix/status')
    phoenixRunning.value = r.data?.running === true
  } catch {
    phoenixRunning.value = false
  }
}

const tabs = computed(() => [
  { key: 'overview', label: '📊 概览' },
  { key: 'quality', label: '🎯 质量' },
  { key: 'performance', label: '⚡ 性能' },
  { key: 'details', label: '📋 明细' },
  { key: 'alerts', label: '🔔 告警' + (unackedAlerts.value ? ` (${unackedAlerts.value})` : '') },
  { key: 'traces', label: '🔄 追踪' + (phoenixRunning.value ? ' 🟢' : '') },
])

function exportCsv() {
  const calls = data.value.recent ?? []
  if (!calls.length) return
  const rows = [['时间','Provider','模型','输入Tokens','输出Tokens','耗时(s)','成本']]
  for (const c of calls) {
    rows.push([fmtTs(c.t), c.provider, c.model, c.prompt, c.completion, c.elapsed ?? '', c.cost])
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'llm_calls.csv'; a.click()
  URL.revokeObjectURL(url)
}

async function ackAll() {
  try {
    await api.post('/api/alerts/ack', { all: true })
    await load()
  } catch {}
}
function ackOne(id: number) {
  api.post('/api/alerts/ack', { id }).then(load).catch(() => {})
}

async function load() {
  try {
    const r = await api.get('/monitoring')
    data.value = r.data
  } catch {}
}

// ── Field accessors matching backend /api/monitoring JSON shape ──

const httpMap = computed(() => data.value.http ?? {})
const httpChart = computed(() =>
  Object.entries(httpMap.value).map(([k, v]) => ({ name: k, count: v as number }))
)
const httpMax = computed(() => Math.max(...httpChart.value.map(i => i.count), 1))

const tokenMap = computed(() => data.value.llm_tokens ?? {})
const tokenChart = computed(() => {
  const byModel: Record<string, number> = {}
  for (const [k, v] of Object.entries(tokenMap.value)) {
    const parts = k.split('/')
    const model = parts[1] ?? k
    byModel[model] = (byModel[model] ?? 0) + (v as number)
  }
  return Object.entries(byModel).map(([name, count]) => ({ name, count }))
})
const tokenMax = computed(() => Math.max(...tokenChart.value.map(i => i.count), 1))

const costMap = computed(() => data.value.llm_costs ?? {})
const costChart = computed(() =>
  Object.entries(costMap.value).map(([k, v]) => ({ name: k, cost: v as number }))
)
const costMax = computed(() => Math.max(...costChart.value.map(i => i.cost), 1))

const gpuName = computed(() => data.value.gpu?.['gpu_0_name'] ?? '')
const hasRedis = computed(() => data.value.redis && Object.keys(data.value.redis).length > 0)
const hasLatency = computed(() => (data.value.latency?.p50 ?? 0) > 0)

const hasRag = computed(() => data.value.rag && (data.value.rag.total ?? 0) > 0)
const unackedAlerts = computed(() => (data.value.alerts ?? []).filter((a: any) => !a.acknowledged).length)
const ragBuckets = computed(() => {
  const b = data.value.rag?.buckets ?? {}
  return [
    { name: 'high', label: '高 (0.6~1.0)', count: b.high ?? 0, cls: 'rag-high' },
    { name: 'medium', label: '中 (0.35~0.6)', count: b.medium ?? 0, cls: 'rag-med' },
    { name: 'low', label: '低 (0~0.35)', count: b.low ?? 0, cls: 'rag-low' },
    { name: 'none', label: '无结果 (0)', count: b.none ?? 0, cls: 'rag-none' },
  ].filter(x => x.count > 0)
})
const ragTotal = computed(() => ragBuckets.value.reduce((s, b) => s + b.count, 0))

const diskChart = computed(() => {
  const disks = data.value.disks ?? []
  const totals: Record<string, number> = data.value.disk_totals ?? {}
  return disks.map((d: any) => ({
    name: d.mount,
    used: fmtBytes(d.used),
    total: fmtBytes(totals[d.mount] ?? 0),
    pct: totals[d.mount] ? Math.round(d.used / totals[d.mount] * 100) : 0,
  }))
})

const llmTotalTokens = computed(() => {
  const m = tokenMap.value
  let total = 0
  for (const v of Object.values(m)) total += v as number
  return total
})
const llmTotalCost = computed(() => {
  const m = costMap.value
  let total = 0
  for (const v of Object.values(m)) total += v as number
  return total
})

function fmtBytes(b: number) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0
  let v = b; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return v.toFixed(1) + ' ' + u[i]
}
function fmtMem(v: number) { return v != null ? fmtBytes(v) : '-' }
function fmtDisk(disks: any) {
  if (!disks?.length) return '-'
  let sum = 0
  for (const d of disks) sum += d.used ?? 0
  return fmtBytes(sum)
}
function pct(v: number, max: number) { return max > 0 ? Math.round(v / max * 100) : 0 }
function fmtCost(v: number) { return v != null ? v.toFixed(4) : '0' }
function fmtNum(v: number) { return v != null ? v.toLocaleString() : '0' }
function fmtTs(ts: number) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleTimeString()
}

let countdown: number | null = null
function startRefresh() {
  load()
  timer = window.setInterval(load, 5000)
  nextRefresh.value = 5
  countdown = window.setInterval(() => {
    if (nextRefresh.value > 0) nextRefresh.value--
    else nextRefresh.value = 5
  }, 1000)
}

onMounted(() => {
  startRefresh()
  checkPhoenix()
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (countdown) clearInterval(countdown)
})
</script>

<style scoped>
.mon-page { max-width: 1100px; margin: 0 auto; padding: 20px; }
.top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.top-bar h2 { font-size: 18px; }
.top-actions { display: flex; gap: 12px; align-items: center; }
.refresh-hint { font-size: 12px; color: #909399; }
.btn-export { background: #409eff; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.btn-export:hover { background: #66b1ff; }
.tab-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid #e4e7ed; }
.tab { padding: 10px 20px; font-size: 14px; color: #909399; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; }
.tab:hover { color: #606266; }
.tab.active { color: #409eff; border-bottom-color: #409eff; font-weight: 600; }
.nav-link { color: #409eff; text-decoration: none; font-size: 14px; }

/* Stat cards */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
.stat-card { background: #fff; border-radius: 10px; padding: 18px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 8px; }
.stat-value { font-size: 24px; font-weight: 700; color: #303133; }
.stat-value.warn { color: #e6a23c; }
.stat-sub { font-size: 13px; font-weight: 400; color: #909399; margin-left: 4px; }

/* Chart rows */
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.chart-box { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.chart-box h3 { font-size: 14px; margin-bottom: 12px; color: #303133; }
.chart-bars { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 80px; font-size: 12px; color: #606266; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; height: 12px; background: #f0f2f5; border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: #409eff; border-radius: 6px; transition: width .5s; }
.bar-fill.tk { background: #67c23a; }
.bar-fill.ct { background: #e6a23c; }
.bar-fill.ds { background: #909399; }
.bar-val { font-size: 12px; color: #606266; width: 60px; text-align: right; flex-shrink: 0; }
.chart-empty { text-align: center; color: #c0c4cc; padding: 24px 0; font-size: 13px; }
.gpu-info { display: flex; flex-direction: column; gap: 6px; }
.gpu-row { display: flex; justify-content: space-between; font-size: 13px; color: #606266; padding: 4px 0; border-bottom: 1px solid #f5f7fa; }
.rag-cards { display: flex; gap: 16px; }
.rag-card { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rag-val { font-size: 20px; font-weight: 700; color: #303133; }
.rag-pies { display: flex; flex-direction: column; gap: 10px; }
.pie-row { display: flex; align-items: center; gap: 8px; }
.pie-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.pie-dot.rag-high { background: #67c23a; }
.pie-dot.rag-med { background: #e6a23c; }
.pie-dot.rag-low { background: #f56c6c; }
.pie-dot.rag-none { background: #c0c4cc; }
.bar-fill.rag-high { background: #67c23a; }
.bar-fill.rag-med { background: #e6a23c; }
.bar-fill.rag-low { background: #f56c6c; }
.bar-fill.rag-none { background: #c0c4cc; }

/* Section */
.section-title { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 12px; }

/* Call table */
.call-table-wrap { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.call-table { width: 100%; border-collapse: collapse; }
.call-table th { background: #f5f7fa; padding: 10px 14px; text-align: left; font-size: 13px; color: #909399; }
.call-table td { padding: 10px 14px; font-size: 13px; color: #606266; border-top: 1px solid #ebeef5; }
.call-table tr:hover { background: #f5f7fa; }
.phoenix-open { background: #fff; border-radius: 10px; padding: 40px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.btn-phoenix { display: inline-block; background: #409eff; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; }
.btn-phoenix:hover { background: #66b1ff; }
.empty { text-align: center; color: #909399; padding: 60px 0; }
</style>
