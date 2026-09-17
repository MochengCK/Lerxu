plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// ---------------------------------------------------------------------------
// 版本号单一来源：仓库根目录的 package.json
//
// 桌面端由 Electron 的 app.getVersion() 直接读该字段（设置页展示、更新比较都用它），
// release 工作流的 release tag 也取自同一字段。Android 在这里读同一个文件，
// 保证「手机端版本 == 桌面端版本」，不再出现两边各写一份导致漂移
// （历史问题：package.json 已是 v3.2.0-Beta1，APK 还停在 1.0.0）。
//
// 解析失败让配置阶段直接失败——静默回退默认值正是版本漂移的根源。
// ---------------------------------------------------------------------------
val packageJson = rootProject.file("../package.json")
require(packageJson.isFile) {
    "找不到 ${packageJson.path}：Android 版本号以仓库根 package.json 为唯一来源"
}

// versionName 逐字符等于 package.json 的 version（含前导 v），与桌面端展示完全一致
val appVersionName: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(packageJson.readText())
    ?.groupValues?.get(1)
    ?.takeIf { it.isNotBlank() }
    ?: throw GradleException("${packageJson.path} 中找不到可用的 \"version\" 字段")

// versionName → versionCode：Android 要求 versionCode 是单调递增的整数。
//   code = major*10^7 + minor*10^5 + patch*10^3 + rank*100 + 预发布序号
//   rank: alpha=1 < beta=2 < rc=3 < 正式版=9
//   于是 3.2.0-Beta1 < 3.2.0-Beta2 < 3.2.0 < 3.2.1-Beta1，且每次发版必然递增
val appVersionCode: Int = run {
    val m = Regex("^[vV]?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.]+))?")
        .find(appVersionName)
        ?: throw GradleException("版本号 $appVersionName 不是 major.minor.patch[-预发布] 形式")
    val major = m.groupValues[1].toInt()
    val minor = m.groupValues[2].toInt()
    val patch = m.groupValues[3].toInt()
    require(minor < 100 && patch < 100) { "版本号 $appVersionName 的 minor/patch 必须小于 100" }

    val pre = m.groupValues.getOrNull(4)?.lowercase().orEmpty()
    val rank = when {
        pre.isEmpty() -> 9
        pre.startsWith("alpha") -> 1
        pre.startsWith("beta") -> 2
        pre.startsWith("rc") -> 3
        else -> 1
    }
    val preNum = Regex("\\d+").find(pre)?.value?.toInt()?.coerceAtMost(99) ?: 0
    major * 10_000_000 + minor * 100_000 + patch * 1_000 + rank * 100 + preNum
}

logger.lifecycle("Lerxu Android 版本：versionName=$appVersionName versionCode=$appVersionCode（取自 package.json）")

android {
    namespace = "com.lerxu.android"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.lerxu.android"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += "arm64-v8a"
        }

        // 确保原生库被解压到文件系统
        packaging {
            jniLibs {
                useLegacyPackaging = true
            }
        }
    }

    // 可选正式签名：CI / 本地通过环境变量注入 keystore 时生成已签名 release APK，
    // 未配置时保持未签名（app-release-unsigned.apk），由使用者自行签名。
    //   ANDROID_KEYSTORE_PATH      keystore 文件路径
    //   ANDROID_KEYSTORE_PASSWORD  keystore 口令
    //   ANDROID_KEY_ALIAS          密钥别名
    //   ANDROID_KEY_PASSWORD       密钥口令
    val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
    val hasReleaseKeystore = !keystorePath.isNullOrBlank()

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/DEPENDENCIES"
        }
        // 确保 .so 文件从 APK 中解压到文件系统，这样可以在 nativeLibraryDir 中直接执行
        jniLibs {
            useLegacyPackaging = true
        }
    }

    sourceSets {
        getByName("main") {
            assets {
                srcDirs("src/main/assets")
            }
            // 将引擎二进制作为 JNI 库打包（伪装成 .so）
            // Android 会在安装时将其提取到 nativeLibraryDir，该目录有 execute 权限
            jniLibs {
                srcDirs("src/main/jniLibs")
            }
        }
    }
}

dependencies {
    // Compose BOM
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    // AndroidX Core
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Compose UI
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // OkHttp for WebSocket
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // DataStore for preferences
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // WorkManager for background service
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")

    // Debugging
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Unit tests (JVM)：引擎二进制完整性 + 展示层纯函数
    testImplementation("junit:junit:4.13.2")
}
