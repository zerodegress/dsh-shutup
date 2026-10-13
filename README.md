# dsh-shutup

让 DSH web 启动即安静的 profile 插件（bundle）：**免 token + 反转 `--no-open` + 允许 `--host 0.0.0.0`**。

目标运行时：**dsh 0.2.0-rc.2**（连接层 `@deepseek-ai/dsh-client-connection@0.2.0-rc.2`）。

## 行为

| 维度 | 上游默认（0.2.0-rc.2） | 装本插件后 |
|---|---|---|
| 浏览器自动打开 | 默认打开，`--no-open` 关闭 | **默认不打开，`--no-open` 反而打开**（字面反转） |
| token 门禁 | 启动打印 `http://127.0.0.1:PORT/?token=xxx`；`/` 与 `/api` 无 cookie 则 `401` | **回到初版 0.0.1-rc.1 风格**：直接 `http://127.0.0.1:PORT/`，无 token、无 401 |
| `--host` | `0.0.0.0` 直接报错拒绝启动 | **允许**（恢复初版 `--host` 文案与 LAN 示例）；打印 `dsh web: http://127.0.0.1:PORT/ (LAN: http://<本机IP>:PORT/)`，两边都是干净 URL |
| Host 信任墙 | 回环 / `--trusted-host` 外 `403` | **保留**：只放行 401，不动 403（`0.0.0.0` 绑定时 LAN IP 由运行时自动加入信任） |

## 安装

```sh
git clone https://github.com/link-fgfgui/dsh-shutup.git
cd dsh-shutup
pnpm install                 # startup.js 的运行时依赖（commander + @deepseek-ai/dsh-cmdline）
dsh plugin --profile web add .
```

profile 侧是 `link:` 安装，改包内文件即时生效，无需重装。

## 验证

```sh
dsh --profile web --dump-config   # 确认 "# == dsh-shutup" 层：web-startup 被禁用、
                                  # web-startup-shutup/shutup 已插入、web-runtime 的 openBrowser 取反
```

## 使用

```sh
dsh --profile web                              # 安静启动，直接打开打印的干净 URL
dsh --profile web --no-open                    # 反而弹浏览器（反转语义）
dsh --profile web --host 0.0.0.0 --port 3080   # 局域网可访问，同时打印 LAN 地址
dsh plugin --profile web remove dsh-shutup     # 移除
```

> 小瑕疵：反转成“`--no-open` 才开浏览器”后，上游那条
> `dsh web: opening the default browser; pass --no-open to disable` 的提示文案不再成立
> （它写死在 `dsh-web-app` 代码里）。功能正确，只是字面误导。

## 远程部署要点

- `--host 0.0.0.0` 绑定全部网卡；运行时从**网卡 IPv4 字面量**推导信任名单，
  所以直接用 `http://<本机IP>:PORT/` 访问即可，无需额外配置。
- 走**反向代理 / 域名**（Host 头不是 IP 字面量）时，信任墙会 403 —— 必须显式加
  `--trusted-host <你的域名>`（可重复）。这是 0.2.0-rc.2 的 `/api` Host/Origin 栅栏，
  本插件**故意不绕过**。
- 0.2.0-rc.2 还没有 `--public-url`（0.2.1 才加入），所以反向代理下的外部 URL
  只是本机/局域网地址，不影响实际访问。

## ⚠️ 安全警告

`--host 0.0.0.0` + 无 token = **局域网内任何设备可直接操作你的 harness
（约等于远程代码执行）**。只在可信网络用；公用 Wi-Fi / 有不可信设备时别开。
上游当初禁 `0.0.0.0` 就是这个原因。反向代理场景请自行加认证层。

## 0.2.0-rc.2 迁移说明

从 0.1.2-rc.1 到 0.2.0-rc.2 的上游变化，以及本插件的对应处理：

- **`@deepseek-ai/dsh-web-app/startup`**：provider 形状不变
  （`{ openBrowser, host?, port?, trustedHosts }`），仅 `--host` 帮助文案改为 `bind host`。
  替换行 `startup.js` 仍是同一份代码，继续恢复 `0.0.0.0` 文案与 LAN 示例。
- **bundle patch**：0.2.0-rc.2 的 web-app 多了 `presets/*.patch.yml`（`standard`/`ptc`/
  `minimal`/`cordis`）。本插件不触碰、不覆盖这些层；`web-runtime` 的 config 键
  （`openBrowser`/`printUrl`/`surfaceContext`/`trustedHosts`）与之相同，所以整段 config 重述依旧成立。
- **`@deepseek-ai/dsh-client-connection`**：`HostConnectionService` 新增 `admit(req)`，
  `/api` 路由改走它。`admit()` 内部就是 `this.requestRejection()`，因此**在实例上改写
  `requestRejection` 仍然覆盖整条传输链**（含 WebSocket 升级），无需单独补 `admit`。
- **`authenticatedUrl(baseUrl)`**：0.2 会保留调用方的挂载路径（0.1 强制重置为 `/`）。
  本插件随之只删除 `?token=` 与 hash，不再把 pathname 打回 `/`，因此带挂载前缀的部署
  也能拿到干净 URL。

## 仓库结构

```
.
├── package.json        # dsh-shutup，dsh.bundle.patch + exports(. / ./startup)
├── cordis.patch.yml    # 禁用上游 web-startup、反转 openBrowser、注册本包两行
├── index.js            # host 半：connection 服务去 token 化（401→放行，403 保留）
├── startup.js          # 上游 web-startup 的去 0.0.0.0 禁令版，提供相同 webStartup 服务
├── preview-shutup.yml  # 免安装预览 overlay（与包内 patch 同步）
└── README.md           # 本文件
```

实现要点：`0.0.0.0` 禁令写在上游 `web-startup` 插件**代码**里，patch 换不掉一行的
`name`（对不上会被 loader 跳过），所以用正统手法——`disabled: true` 掉上游行，
再插入 `web-startup-shutup` 行提供完全相同的 `webStartup` 服务。

## 版本

- `0.1.0` — 免 token + 反转 `--no-open`
- `0.2.0` — 允许 `--host 0.0.0.0`（startup 替换行），鉴权保持初版风格
- `0.3.0` — 移植到 dsh 0.2.0-rc.2（`admit()` 路由、保留挂载路径的 `authenticatedUrl`）
