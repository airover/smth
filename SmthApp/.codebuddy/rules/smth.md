---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---

# 后台接口访问
- 访问后台接口默认都增加超时控制，在访问接口过程中不要在界面展示“暂无xx"字样, 访问接口超时或返回失败时不更新本地数据
- 通过后台接口获取到数据默认增加缓存，优先展示缓存数据，缓存过期后做异步更新, 下拉刷新时同步等待后台返回最新数据

# 修改操作
- 每次修改完都确保编译成功
- 修改完不要自动启动模拟器来验证
- 修改完后不要自动提交GIT