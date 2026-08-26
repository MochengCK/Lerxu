import { extname, basename, dirname } from 'path'
import { existsSync, mkdirSync, renameSync, statSync, utimesSync } from 'fs'

// 默认文件分类规则
export const DEFAULT_CATEGORIES = {
  images: { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] },
  videos: { name: '视频', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'] },
  audio: { name: '音频', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'] },
  documents: { name: '文档', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md'] },
  archives: { name: '压缩包', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'] },
  programs: { name: '程序', extensions: ['exe', 'msi', 'deb', 'rpm', 'dmg', 'apk', 'app'] },
  others: { name: '其他', extensions: [] } // 其他文件类型
}

// 从URL或文件名中提取扩展名（处理查询参数）
export const getFileExtension = (filename) => {
  // 移除URL查询参数
  const cleanFilename = filename.split('?')[0].split('#')[0]
  const ext = extname(cleanFilename).toLowerCase().replace('.', '')
  return ext
}

// 获取文件分类
export const getFileCategory = (filename, categories = DEFAULT_CATEGORIES) => {
  const ext = getFileExtension(filename)

  for (const [category, categoryConfig] of Object.entries(categories)) {
    if (categoryConfig.extensions && categoryConfig.extensions.includes(ext)) {
      return category
    }
  }

  return 'others'
}

// 构建分类后的文件路径
export const buildCategorizedPath = (originalPath, filename, categories, baseDir) => {
  const category = getFileCategory(filename, categories)
  const categoryConfig = categories[category]
  const folderName = categoryConfig && categoryConfig.name ? categoryConfig.name : category
  const categorizedDir = `${baseDir}/${folderName}`

  return {
    originalPath,
    categorizedPath: `${categorizedDir}/${filename}`,
    category,
    categorizedDir,
    folderName
  }
}

// 处理多个文件的分类路径
export const buildCategorizedPaths = (uris, out, categories, baseDir) => {
  const result = []

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i]
    const filename = out && out[i] ? out[i] : basename(uri)

    const categorizedInfo = buildCategorizedPath(uri, filename, categories, baseDir)
    result.push(categorizedInfo)
  }

  return result
}

// 检查是否应该使用分类功能
export const shouldCategorizeFiles = (autoCategorize, categories) => {
  return autoCategorize && categories && Object.keys(categories).length > 0
}

// 创建分类文件夹（如果不存在）
export const createCategoryDirectory = (categorizedDir) => {
  try {
    if (!existsSync(categorizedDir)) {
      mkdirSync(categorizedDir, { recursive: true })
      console.log(`[Lerxu] Created category directory: ${categorizedDir}`)
      return true
    }
    return false
  } catch (error) {
    console.warn(`[Lerxu] Failed to create category directory: ${error.message}`)
    return false
  }
}

// 移动文件到分类文件夹
export const moveFileToCategory = (originalPath, categorizedPath) => {
  try {
    // 目标文件夹已经在下载前创建，不需要再次创建

    // 移动文件
    if (existsSync(originalPath) && !existsSync(categorizedPath)) {
      let at, mt
      try {
        const st = statSync(originalPath)
        at = st.atime
        mt = st.mtime
      } catch (_) {}
      renameSync(originalPath, categorizedPath)
      try {
        if (at && mt) {
          utimesSync(categorizedPath, at, mt)
        }
      } catch (_) {}
      console.log(`[Lerxu] Moved file to category: ${originalPath} -> ${categorizedPath}`)
      return true
    } else if (existsSync(categorizedPath)) {
      console.log(`[Lerxu] File already exists in category: ${categorizedPath}`)
      return false
    } else {
      console.warn(`[Lerxu] Original file not found: ${originalPath}`)
      return false
    }
  } catch (error) {
    console.warn(`[Lerxu] Failed to move file to category: ${error.message}`)
    return false
  }
}

// 自动分类下载完成的文件
export const autoCategorizeDownloadedFile = (filePath, baseDir, categories = DEFAULT_CATEGORIES) => {
  const filename = basename(filePath)
  const categorizedInfo = buildCategorizedPath(filePath, filename, categories, baseDir)

  createCategoryDirectory(categorizedInfo.categorizedDir)

  // 如果文件已经在分类文件夹中，不需要移动
  if (dirname(filePath) === dirname(categorizedInfo.categorizedPath)) {
    console.log(`[Lerxu] File already in category folder: ${filePath}`)
    return false
  }

  return moveFileToCategory(filePath, categorizedInfo.categorizedPath)
}
