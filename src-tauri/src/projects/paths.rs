//! 路径展示 / 存储形式。
//!
//! `fs::canonicalize` 在 Windows 上返回扩展长度路径（`\\?\C:\…`、`\\?\UNC\server\share\…`），
//! 直接存进配置、显示在界面或复制到剪贴板都不友好。这里在**写入配置、返回前端、扫描结果**
//! 这几个边界上把可安全转换的形式还原成普通路径；文件系统访问仍在内部使用规范化路径。
//!
//! 只做字符串层面的、可逆的转换：转换后不是合法绝对路径时保持原样。

use std::path::Path;

const VERBATIM: &str = r"\\?\";
const VERBATIM_UNC: &str = r"\\?\UNC\";

/// 把 Windows 扩展路径还原成普通形式；其他平台的路径原样返回。
pub fn normalize_path_string(raw: &str) -> String {
    if let Some(rest) = strip_prefix_ignore_case(raw, VERBATIM_UNC) {
        // \\?\UNC\server\share\… → \\server\share\…
        let converted = format!(r"\\{rest}");
        return if is_unc_path(&converted) { converted } else { raw.to_string() };
    }

    if let Some(rest) = raw.strip_prefix(VERBATIM) {
        // \\?\C:\… → C:\…；其余（卷 GUID 等）保持原样
        if is_drive_absolute(rest) {
            return rest.to_string();
        }
    }

    raw.to_string()
}

/// 路径的展示 / 存储形式
pub fn path_string(path: &Path) -> String {
    normalize_path_string(&path.to_string_lossy())
}

fn strip_prefix_ignore_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    let head = value.get(..prefix.len())?;
    if head.eq_ignore_ascii_case(prefix) {
        value.get(prefix.len()..)
    } else {
        None
    }
}

/// `C:\` 或 `C:/`（盘符 + 根分隔符）
fn is_drive_absolute(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

/// `\\server\share…`
fn is_unc_path(value: &str) -> bool {
    let rest = match value.strip_prefix(r"\\") {
        Some(rest) => rest,
        None => return false,
    };
    if rest.starts_with('?') || rest.starts_with('.') {
        return false;
    }
    // 至少要落到 \\server\share
    let mut parts = rest.split(['\\', '/']).filter(|part| !part.is_empty());
    matches!((parts.next(), parts.next()), (Some(_), Some(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_drive_verbatim_paths() {
        assert_eq!(normalize_path_string(r"\\?\C:\work\repo"), r"C:\work\repo");
        assert_eq!(normalize_path_string(r"\\?\C:\"), r"C:\");
        assert_eq!(normalize_path_string(r"\\?\c:\work"), r"c:\work");
        // 规范化结果里的正斜杠也接受
        assert_eq!(normalize_path_string(r"\\?\D:/work"), r"D:/work");
    }

    #[test]
    fn converts_verbatim_unc_paths() {
        assert_eq!(normalize_path_string(r"\\?\UNC\server\share\repo"), r"\\server\share\repo");
        assert_eq!(normalize_path_string(r"\\?\unc\server\share"), r"\\server\share");
    }

    #[test]
    fn keeps_paths_that_would_not_be_absolute() {
        // 盘符后没有根分隔符：不是绝对路径，保持原样
        assert_eq!(normalize_path_string(r"\\?\C:"), r"\\?\C:");
        assert_eq!(normalize_path_string(r"\\?\C:work"), r"\\?\C:work");
        // 卷 GUID
        assert_eq!(
            normalize_path_string(r"\\?\Volume{4c1b02c1-0000-0000-0000-100000000000}\work"),
            r"\\?\Volume{4c1b02c1-0000-0000-0000-100000000000}\work"
        );
        // 不完整的 UNC
        assert_eq!(normalize_path_string(r"\\?\UNC\server"), r"\\?\UNC\server");
        assert_eq!(normalize_path_string(r"\\?\"), r"\\?\");
    }

    #[test]
    fn leaves_ordinary_paths_untouched() {
        for raw in [
            r"C:\work\repo",
            r"\\server\share\repo",
            "/Users/ik/code",
            "",
            r"\\?\nonsense",
        ] {
            assert_eq!(normalize_path_string(raw), raw);
        }
    }

    #[test]
    fn path_string_uses_the_same_conversion() {
        assert_eq!(path_string(Path::new(r"\\?\C:\work\repo")), r"C:\work\repo");
        assert_eq!(path_string(Path::new("/Users/ik/code")), "/Users/ik/code");
    }
}
