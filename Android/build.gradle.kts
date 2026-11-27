// Top-level build file
plugins {
    // AGP 9.5.3：Kotlin 由 AGP 内置，不再需要 `org.jetbrains.kotlin.android`；
    // Gradle wrapper 同步升到 9.9.2，Compose / Serialization 编译器插件跟 Kotlin 2.4.21。
    id("com.android.application") version "9.5.3" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.21" apply false
}
