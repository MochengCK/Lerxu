package com.lerxu.android.ui.screen

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lerxu.android.R
import com.lerxu.android.model.TaskFile
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/**
 * 任务文件选择 —— 底部弹窗。
 *
 * 供"待选择文件"状态的 BT 任务点击重开（添加时未确认勾选即退出）：
 * 确认后 select-file + 恢复下载；未确认直接退出则任务保持待选择状态。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskFileSelectionSheet(
    gid: String,
    viewModel: TaskViewModel,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = MaterialTheme.colorScheme
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var files by remember { mutableStateOf<List<TaskFile>>(emptyList()) }
    var taskName by remember { mutableStateOf("") }
    // null = 文件布局未就绪；就绪后为当前选中索引（0 起算）
    var selection by remember { mutableStateOf<Set<Int>?>(null) }

    // 轮询等待文件布局就绪（正常情况下元数据已就绪，这里仅兜底）
    LaunchedEffect(gid) {
        while (isActive) {
            try {
                val t = viewModel.getRpcClient().tellStatus(gid)
                if (t.files.isNotEmpty()) {
                    files = t.files
                    taskName = t.fileName
                    selection = t.files
                        .mapIndexedNotNull { i, f -> if (f.selected) i else null }
                        .toSet()
                    break
                }
            } catch (_: Exception) {
            }
            delay(1000)
        }
    }

    val confirmSelection: () -> Unit = confirm@{
        val sel = selection ?: return@confirm
        if (sel.isEmpty()) {
            Toast.makeText(context, context.getString(R.string.select_at_least_one), Toast.LENGTH_SHORT).show()
            return@confirm
        }
        scope.launch {
            val ok = viewModel.changeTaskOption(
                gid,
                mapOf("select-file" to JsonPrimitive(sel.map { it + 1 }.joinToString(",")))
            )
            if (ok) {
                try { viewModel.getRpcClient().resumeTask(gid) } catch (_: Exception) {}
                Toast.makeText(context, context.getString(R.string.selection_applied), Toast.LENGTH_SHORT).show()
                onDismiss()
            } else {
                Toast.makeText(context, context.getString(R.string.selection_failed), Toast.LENGTH_SHORT).show()
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colorScheme.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp)
                // 贴边全宽形态下，内容底部避让手势条/导航栏
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                stringResource(R.string.select_files_hint),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            if (taskName.isNotEmpty()) {
                Text(
                    taskName,
                    style = MaterialTheme.typography.labelSmall,
                    color = colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            val sel = selection
            if (sel == null) {
                Box(
                    Modifier.fillMaxWidth().height(160.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(30.dp),
                        strokeWidth = 3.dp,
                        color = colorScheme.primary
                    )
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = colorScheme.surfaceContainerLow,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp),
                        contentPadding = PaddingValues(vertical = 4.dp)
                    ) {
                        items(files.size) { i ->
                            val file = files[i]
                            val checked = i in sel
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selection = if (checked) sel - i else sel + i
                                    }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    if (checked) Icons.Default.CheckCircle
                                    else Icons.Default.RadioButtonUnchecked,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = if (checked) colorScheme.primary else colorScheme.outline
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    file.path.substringAfterLast('/').substringAfterLast('\\')
                                        .ifEmpty { stringResource(R.string.file_index, file.index) },
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    formatBytes(file.length),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${sel.size}/${files.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = colorScheme.onSurfaceVariant
                    )
                    TextButton(
                        onClick = {
                            selection = if (sel.size == files.size) emptySet()
                            else (0 until files.size).toSet()
                        }
                    ) {
                        Text(
                            stringResource(
                                if (sel.size == files.size) R.string.select_none
                                else R.string.select_all
                            )
                        )
                    }
                }
                Button(
                    onClick = confirmSelection,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.start_download), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
