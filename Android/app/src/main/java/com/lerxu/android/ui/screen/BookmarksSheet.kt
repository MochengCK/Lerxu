package com.lerxu.android.ui.screen

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkRemove
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lerxu.android.R
import com.lerxu.android.browser.Bookmark
import com.lerxu.android.browser.Bookmarks
import com.lerxu.android.browser.BrowseHistory
import kotlinx.coroutines.launch

/**
 * **书签**弹窗（「更多功能」宫格里的第一枚书签键）。
 *
 * 与历史弹窗同一套壳：同一个 [ModalBottomSheet]、同一个 [SettingsSheetHeader]（左返回 + 中标题）、
 * `dragHandle = null`、顶部状态栏空间统一由 [SheetPanel] 预留，
 * 底部的呼吸位由内容自己加（见 [sheetBottomGap]）—— 三处与 [BrowserHistorySheet] 完全一致，
 * 两张弹窗摊开时不该有第二种版式。
 *
 * 与历史那张**故意不一样**的地方：
 * - **没有搜索、没有筛选、也没有分组**：书签是用户自己一条条收的，量本来就小（上限 500），
 *   按"最后加入的在前"排一条平铺列表就够；分日组反而会把同一批收藏拆散。
 * - **删除就在行尾**（一枚 ✕）：历史那边一屏可能有几百条、才值得用左滑省地方；书签一行
 *   都舍不得删，把动作摆在明面上更好按，也省掉一层手势。
 *
 * 行里点一下 = 去那个地址（由调用方负责关弹窗 + 切到浏览器页；先关再导航，否则动画会和
 * 页面加载抢同一拍 —— 与历史那一条同一个理由）。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BrowserBookmarksSheet(
    bookmarks: List<Bookmark>,
    /** 点某一行：去这个地址（由调用方负责关弹窗 + 切到浏览器页）。 */
    onOpen: (String) -> Unit,
    /** 行尾那枚 ✕：把这些地址从书签里删掉（见 BrowserController.removeBookmarks）。 */
    onDelete: (List<String>) -> Unit,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    // 与设置 / 历史弹窗同一档"不容易误触"的下滑关闭（见 rememberSheetStateFirmDismiss）
    val sheetState = rememberSheetStateFirmDismiss()
    // 状态栏高度必须在弹窗外层取（弹窗内部读到的是被自身偏移扣过的值）
    val sheetTopGap = rememberSheetTopGap()
    // 先收起再回调关闭：直接置 false 会让弹窗"啪"地消失，没有下滑动画（与另两张弹窗同一处理）
    val dismissAnimated: () -> Unit = {
        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0) }
    ) {
        SheetPanel(topGap = sheetTopGap) {
            SettingsSheetHeader(
                title = stringResource(R.string.browser_dock_more_bookmarks),
                onBack = dismissAnimated
            )
            if (bookmarks.isEmpty()) {
                BookmarksEmptyHint()
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = sheetBottomGap(24.dp))
                ) {
                    items(bookmarks, key = { it.url }) { bookmark ->
                        BookmarkRow(
                            bookmark = bookmark,
                            onClick = { onOpen(bookmark.url) },
                            onDelete = { onDelete(listOf(bookmark.url)) }
                        )
                    }
                }
            }
        }
    }
}

/**
 * 一行书签：**左图标 + 中标题/站点 + 右删除**。
 *
 * 图标走的还是历史那张弹窗里的 [SiteIcon]（真实 favicon 优先、拿不到是通用地球）——
 * 同一个站点在两处长得一样，用户不用重新认一遍。
 */
@Composable
private fun BookmarkRow(
    bookmark: Bookmark,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SiteIcon(url = bookmark.url)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = Bookmarks.displayTitle(bookmark),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = BrowseHistory.subtitleOf(bookmark.url),
                style = MaterialTheme.typography.bodySmall,
                color = colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        // 删除摆**行尾**（不做左滑）：书签量小，动作露出来比藏一层手势好按
        IconButton(onClick = onDelete, modifier = Modifier.size(40.dp)) {
            Icon(
                Icons.Outlined.BookmarkRemove,
                contentDescription = stringResource(R.string.delete_bookmark),
                tint = colorScheme.onSurfaceVariant,
                modifier = Modifier.size(19.dp)
            )
        }
    }
}

/** 空状态：一条书签都没有（第一次进来看到的就是它）。 */
@Composable
private fun ColumnScope.BookmarksEmptyHint() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f)
            .padding(horizontal = 24.dp, vertical = 48.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(R.string.bookmarks_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
