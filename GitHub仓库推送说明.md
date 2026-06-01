# GitHub 仓库推送说明

## 1. 目的

```text
GitHub 用于保存项目代码；
Render 从 GitHub 仓库拉取代码并完成线上部署。
```

GitHub 不是运行服务器，真正运行项目的是 Render。

## 2. 本地仓库状态

当前项目已经初始化为 Git 仓库。

当前 GitHub 仓库：

```text
https://github.com/xiaoxiaocai932-jpg/ai-support-agent
```

仓库状态：

```text
private
```

默认分支：

```text
main
```

已确认不会提交：

```text
1. .env
2. node_modules
3. dist
4. data/support-agent.db
5. 数据库 WAL / SHM 文件
6. 验证截图
```

## 3. 创建 GitHub 仓库

在 GitHub 新建一个空仓库，建议名称：

```text
ai-support-agent
```

创建时建议：

```text
1. 不勾选 Add a README file
2. 不勾选 Add .gitignore
3. 不选择 License
```

原因：

```text
本地项目已经包含完整文件和 .gitignore，远程仓库保持为空可以减少首次推送冲突。
```

## 4. 推送命令

将下面命令中的地址替换为你的 GitHub 仓库地址：

```bash
git remote add origin https://github.com/你的用户名/ai-support-agent.git
git branch -M main
git push -u origin main
```

如果 GitHub 要求登录，按终端提示完成登录或使用 Personal Access Token。

## 5. 推送后检查

进入 GitHub 仓库页面，确认可以看到：

```text
1. src
2. server
3. package.json
4. package-lock.json
5. render.yaml
6. 部署与交付说明.md
7. 系统构建过程文档.md
8. 各端网址.md
```

确认看不到：

```text
1. .env
2. node_modules
3. dist
4. data/support-agent.db
```

## 6. 下一步

```text
GitHub 推送完成后，进入 Render 创建 Web Service。
Render 连接 GitHub 仓库后，会读取 render.yaml 并执行部署。
```
