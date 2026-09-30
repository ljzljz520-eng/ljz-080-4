# 铁甲云养 · 工程机械保养派单系统

面向工程机械租赁公司的一体化派单系统：

- **租赁公司**回传挖机 / 吊车 / 压路机的工作小时数、故障码、所在工地；
- 系统按**机型保养周期规则引擎**自动判断到期项，结合**就近 + 技能 + 负荷**算法派给附近技师；
- **技师手机端**接单、到场、作业，填写**用料、现场照片、停机时长**，**断网可完整填写**（IndexedDB + Service Worker），恢复联网自动补报；
- **客户**在手机上核对用料/照片，**确认是否恢复作业**，未通过可退回返工。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | React 18 + Vite + React Router | PC 调度端 + 移动外勤页同一应用 |
| 离线 | Service Worker + IndexedDB + Outbox 模式 | App Shell/GET 缓存、写操作 FIFO 重放 |
| 后端 | Node.js 20 + Express 4 | 零原生依赖 |
| 存储 | JSON 文件（`server/data/db.json`）+ 照片落盘 | 演示/单机部署，可平滑替换为 Postgres + OSS |

## 快速开始

```bash
npm install            # 安装 workspaces 全部依赖
npm run seed           # 写入演示数据（上海 4 工地 / 5 技师 / 8 设备 / 5 工单）
npm run dev            # 并行启动 API(:4000) 与 Web(:5173)
# 浏览器打开 http://localhost:5173
```

生产模式（单端口，由 Express 托管前端构建产物）：

```bash
npm run build
npm run seed
npm start              # http://localhost:4000
```

## 页面与演示路径

| 路由 | 角色 | 功能 |
| --- | --- | --- |
| `/` | 调度员 | 看板统计、进行中工单、设备周期进度条、技师负荷、全盘扫描派单 |
| `/sync` | 租赁公司 | 单台/批量 JSON 回传小时数·故障码·工地，同步后立即自动派单 |
| `/orders` | 调度员 | 全量工单筛选、搜索、详情（时间线/用料/照片/客户意见） |
| `/tech` | 技师 | 手机外勤：接单→出发→到场→作业→完工上报；**顶部可一键模拟断网** |
| `/customer` 或 `/customer/:id` | 客户 | 待确认列表、照片用料核对、恢复作业 / 退回返工 |

建议演示动线：

1. `/sync` 点"填入演示数据"→批量同步，观察 **502h 挖机、903h 压路机、2402h 吊车 + E202 故障** 即时生成工单；
2. `/` 看板查看新派工单与匹配技师（距离/技能/负荷打分）；
3. `/tech` 选择技师（如周大勇，名下 3 单），点**"模拟断网"**后照常接单、填用料、拍照、写停机时长 → 提示存入本机；
4. 切回联网，Outbox 自动重放（先传照片再交正文），工单进入"待客户确认"；
5. `/customer` 打开待确认单 → 确认恢复作业（设备保养基线自动前移、故障码清除）或退回返工。

## 保养规则（按工作小时，可在 `server/src/engine.js` 调整）

| 机型 | 周期档 |
| --- | --- |
| 挖掘机 | 500h 小保养 / 1000h 液压回油滤芯 / 2000h 大保养 / 4000h 齿轮油·回转支承 |
| 吊车 | 500h / 1200h 液压滤芯 / 2400h 大保养 / 4800h 减速机齿轮油·钢丝绳探伤 |
| 压路机 | 300h 小保养 / 900h 振动轮润滑 / 1800h 大保养 |

- 跨越周期档（`floor(hours/interval)` 增大）即生成保养工单；
- 故障码（`E101/E201/E501…`）生成维修工单，critical 故障标记为"紧急"；
- 同设备 + 同周期档（或同组故障码）存在未关闭工单时**不重复派单**；
- 客户确认恢复后 `lastServiceHours` 前移、故障码清除，周期重新计时。

## 派单算法

1. 过滤可服务该机型（`skills`）的在岗技师；
2. Haversine 计算技师与工地距离，默认 60km 半径；
3. 综合打分：`距离km + 在手工单数×8 + 忙碌惩罚(15/40)`，取最优；
4. 半径内无人时记录 `noAvailableTech`，调度台可见，不丢单。

## 离线方案（核心）

```
在线写操作 ──成功──▶ 服务端（x-client-req-id 幂等键）
        └─失败/离线─▶ IndexedDB outbox
                         │
        online 事件 / visibilitychange / 20s 轮询 / 手动重试
                         ▼
                   FIFO 重放：照片先传(/api/photos)拿 URL → 再交工单正文
```

- **Service Worker(`/sw.js`)**：预缓存 App Shell；构建产物缓存优先；`/api` GET 网络优先并留快照，离线返回缓存；导航离线回退 `index.html`。
- **IndexedDB**：`kv` 存每技师工单快照；`outbox` 存待上报动作（状态流转 + 完工上报 + 照片）。
- **照片**：本地先压缩到最长边 1024px 的 JPEG（`fileToCompressedDataUrl`），作为 dataURL 随队列保存在本机，重放时先上传。
- **幂等**：每条队列带 UUID 幂等键，重放/重复点击不会产生重复数据；状态流转的重复请求返回 409，已成功的请求返回缓存响应（`X-Idempotent-Replay: 1`）。
- PWA manifest 已配置，可"添加到主屏幕"全屏使用。

## 主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dashboard` | 看板汇总 |
| GET/POST | `/api/sites` `/api/machines` `/api/technicians` | 基础数据 |
| POST | `/api/telemetry` | 工况回传（支持 records 批量），同步后立即评估派单 |
| POST | `/api/dispatch/run` | 手动全盘扫描派单 |
| GET | `/api/work-orders?status=&technicianId=` | 工单列表 |
| POST | `/api/work-orders/:id/transition` | 状态流转（接单/出发/到场/作业/取消） |
| POST | `/api/work-orders/:id/report` | 技师完工上报（用料/照片/停机/说明），幂等 |
| POST | `/api/work-orders/:id/confirm` | 客户确认 `{resume,comment,confirmer}` |
| POST | `/api/photos` | 照片 dataURL 上传，返回 `/uploads/...` |

## 目录

```
server/src/
  index.js      Express 路由 + 幂等中间件 + 生产静态托管
  engine.js     机型周期规则 / 故障码字典 / 距离与派单打分
  dispatch.js   评估-防重-就近派单-生成工单
  db.js         JSON 持久化（防抖串行写）
  seed.js       演示数据
client/src/
  pages/        Dashboard / SyncPage / OrdersPage / TechPage / CustomerPage
  components/   AppShell / OrderModal / ReportForm / Badge / OfflineBar / Toasts
  lib/          api / idb / outbox(同步引擎) / useOnline / useApi / format
  public/sw.js  Service Worker
```

## 可演进方向

- 存储替换 Postgres、照片替换 OSS/MinIO；
- 接入设备 IoT 网关（MQTT → `/api/telemetry`）与短信/企微通知；
- 技师端定位签到、电子签名、备件库存联动；
- 客户小程序端复用同一确认接口。
