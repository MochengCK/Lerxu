// Top-level build file
plugins {
    // AGP 8.8.2：**最低 Gradle 8.10.2，与 wrapper 一致，不用动 wrapper**。
    //
    // 为什么必须 ≥8.8（2026-10-05）：AGP 8.7.3 的 lint 里 `KaCallableMemberCall` 是
    // **abstract class**，而 `androidx.lifecycle` 那套 lint 检查是按 **interface** 编译的
    // ⇒ lint 分析阶段直接抛 `IncompatibleClassChangeError`，`lintVitalAnalyzeRelease`
    // 整个失败（release 构建挂掉，debug 不跑 lint 所以本地看不出来）。
    // 8.8 起 AGP 自带的 Kotlin 分析 API 里它是 interface，两边对上，问题从根上消失
    //（判据是 `javap -cp kotlin-compiler-31.x.jar …KaCallableMemberCall` 打的是 class 还是 interface）。
    // 因此 app 模块里那条 `lint { disable += "NullSafeMutableLiveData" }` 的临时规避可以删掉。
    id("com.android.application") version "8.8.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
}
