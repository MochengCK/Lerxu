package com.lerxu.android

import com.lerxu.android.update.AppVersion
import com.lerxu.android.update.ReleaseChannel
import com.lerxu.android.update.ReleaseInfo
import com.lerxu.android.update.ReleasePicker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 更新渠道与版本比较测试。
 *
 * 背景：安卓端新增「更新渠道」（stable/beta/all），与桌面端同语义。
 * 旧实现把版本号在 `-` 处截断后再逐段取数字，3.2.0-Beta1 与 3.2.0-Beta2
 * 会被折叠成同一个版本 —— Beta 渠道永远检测不到新 Beta。这里把
 * 「谁比谁新」和「某渠道该选哪个 release」两件事都钉住。
 */
class AppUpdateTest {

    // ─── 版本比较：预发布语义 ───

    @Test
    fun `newer beta within same minor is detected`() {
        assertTrue(AppVersion.isNewer("v3.2.0-Beta2", "v3.2.0-Beta1"))
        assertFalse(AppVersion.isNewer("v3.2.0-Beta1", "v3.2.0-Beta2"))
    }

    @Test
    fun `release outranks its prereleases`() {
        assertTrue(AppVersion.isNewer("v3.2.0", "v3.2.0-Beta1"))
        assertFalse(AppVersion.isNewer("v3.2.0-Beta1", "v3.2.0"))
    }

    @Test
    fun `prerelease numbering compares numerically not lexically`() {
        assertTrue(AppVersion.isNewer("v3.2.0-Beta10", "v3.2.0-Beta2"))
        assertTrue(AppVersion.isNewer("v3.1.0-Beta8", "v3.1.0-Beta7"))
    }

    @Test
    fun `patch and minor compare numerically`() {
        assertTrue(AppVersion.isNewer("v3.2.10", "v3.2.9"))
        assertTrue(AppVersion.isNewer("v3.3.0", "v3.2.99"))
        assertFalse(AppVersion.isNewer("v3.2.0", "v3.2.0"))
    }

    @Test
    fun `older stable does not offer a downgrade to a newer beta`() {
        // 正式版 3.1.0 用户切到 beta 渠道时：3.2.0-Beta1 更新
        assertTrue(AppVersion.isNewer("v3.2.0-Beta1", "v3.1.0"))
        // 反过来：3.2.0-Beta1 用户切回稳定版，最新正式版 3.1.0 不能当更新
        assertFalse(AppVersion.isNewer("v3.1.0", "v3.2.0-Beta1"))
    }

    @Test
    fun `stage ordering follows semver`() {
        assertTrue(AppVersion.isNewer("v3.2.0-beta1", "v3.2.0-alpha1"))
        assertTrue(AppVersion.isNewer("v3.2.0-rc1", "v3.2.0-beta9"))
        assertTrue(AppVersion.isNewer("v3.2.0", "v3.2.0-rc1"))
    }

    @Test
    fun `build metadata and v prefix are ignored`() {
        assertEquals(0, AppVersion.compare("3.2.0+build.5", "v3.2.0"))
        assertEquals(0, AppVersion.compare("V3.2.0", "3.2.0"))
    }

    @Test
    fun `prerelease detection matches desktop regex`() {
        assertTrue(AppVersion.isPrerelease("v3.2.0-Beta1"))
        assertTrue(AppVersion.isPrerelease("3.1.0-Beta8"))
        assertTrue(AppVersion.isPrerelease("3.2.0-rc.1"))
        assertFalse(AppVersion.isPrerelease("v3.2.0"))
        assertFalse(AppVersion.isPrerelease("v3.1.0"))
    }

    // ─── 渠道选版 ───

    private fun release(
        tag: String,
        prerelease: Boolean = false,
        draft: Boolean = false
    ) = ReleaseInfo(
        tag = tag,
        prerelease = prerelease,
        draft = draft,
        notes = "",
        pageUrl = "https://github.com/MochengCK/Lerxu/releases/tag/$tag",
        apkUrl = "https://github.com/MochengCK/Lerxu/releases/download/$tag/app-release.apk"
    )

    private val sample = listOf(
        release("v3.1.0"),
        release("v3.2.0-Beta1", prerelease = true),
        release("v3.1.0-Beta8", prerelease = true),
        release("v3.2.0", draft = true)
    )

    @Test
    fun `stable channel only picks non prerelease`() {
        assertEquals("v3.1.0", ReleasePicker.pick(sample, ReleaseChannel.STABLE)?.tag)
    }

    @Test
    fun `beta channel only picks the newest prerelease`() {
        assertEquals("v3.2.0-Beta1", ReleasePicker.pick(sample, ReleaseChannel.BETA)?.tag)
    }

    @Test
    fun `all channel picks the highest version overall`() {
        assertEquals("v3.2.0-Beta1", ReleasePicker.pick(sample, ReleaseChannel.ALL)?.tag)
    }

    @Test
    fun `drafts are never offered`() {
        val draftsOnly = listOf(release("v9.9.9", draft = true))
        assertNull(ReleasePicker.pick(draftsOnly, ReleaseChannel.ALL))
    }

    @Test
    fun `beta channel reports no candidate when only stable releases exist`() {
        // 没有符合条件的候选 ≠ 拉取失败：调用方据此提示「已是最新版本」
        val stableOnly = listOf(release("v3.1.0"), release("v3.0.5"))
        assertNull(ReleasePicker.pick(stableOnly, ReleaseChannel.BETA))
        assertEquals("v3.1.0", ReleasePicker.pick(stableOnly, ReleaseChannel.STABLE)?.tag)
    }

    @Test
    fun `stable channel ignores prerelease even when its version is higher`() {
        val mixed = listOf(release("v3.3.0-Beta1", prerelease = true), release("v3.2.0"))
        assertEquals("v3.2.0", ReleasePicker.pick(mixed, ReleaseChannel.STABLE)?.tag)
    }

    @Test
    fun `stable channel also rejects mislabeled prerelease tag`() {
        // 发布时漏勾 Pre-release：只信标志会把 Beta 推给稳定版用户，故按版本号兜底排除
        val mislabeled = listOf(release("v3.3.0-Beta1", prerelease = false))
        assertNull(ReleasePicker.pick(mislabeled, ReleaseChannel.STABLE))
        assertEquals("v3.3.0-Beta1", ReleasePicker.pick(mislabeled, ReleaseChannel.BETA)?.tag)
    }

    @Test
    fun `all channel prefers newer beta over older stable`() {
        val mixed = listOf(release("v3.2.0"), release("v3.3.0-Beta1", prerelease = true))
        assertEquals("v3.3.0-Beta1", ReleasePicker.pick(mixed, ReleaseChannel.ALL)?.tag)
    }

    @Test
    fun `channel keys fall back to stable`() {
        assertEquals(ReleaseChannel.BETA, ReleaseChannel.fromKey("beta"))
        assertEquals(ReleaseChannel.ALL, ReleaseChannel.fromKey("ALL"))
        assertEquals(ReleaseChannel.STABLE, ReleaseChannel.fromKey(null))
        // 历史默认值 'latest' 与非法值一律回落到稳定版
        assertEquals(ReleaseChannel.STABLE, ReleaseChannel.fromKey("latest"))
        assertEquals(ReleaseChannel.STABLE, ReleaseChannel.fromKey("nonsense"))
    }
}
