# Quick Setup - React Native (1 Lệnh)

## 🚀 Setup Tự Động (Recommended)

### Cách 1: Chạy Script (Dễ nhất!)

```bash
# Từ thư mục ClaudeKit source
cd ~/Downloads/claudekit-engineer-main

# Chạy script với path tới project React Native
bash setup-react-native.sh /path/to/your-react-native-project

# Ví dụ cụ thể:
bash setup-react-native.sh ~/Projects/MyAwesomeApp
```

Script sẽ tự động:
- ✅ Copy .claude và .opencode directories
- ✅ Tạo CLAUDE.md với React Native template
- ✅ Tạo docs và plans directories
- ✅ Setup React Native skill
- ✅ Make hooks executable
- ✅ Git commit (nếu bạn muốn)

### Cách 2: Manual Setup (3 lệnh)

```bash
# 1. Vào project của bạn
cd /path/to/your-react-native-project

# 2. Copy files từ ClaudeKit
cp -r ~/Downloads/claudekit-engineer-main/.claude .
cp -r ~/Downloads/claudekit-engineer-main/.opencode .
cp ~/Downloads/claudekit-engineer-main/CLAUDE.md .
mkdir -p docs plans

# 3. Customize CLAUDE.md
nano CLAUDE.md  # Sửa tech stack và commands
```

## ▶️ Bắt Đầu Coding

```bash
# Trong project directory
claude

# Test command đầu tiên
/plan "add a simple profile screen"
```

## 📚 Next Steps

- Xem [Setup chi tiết](./setup-react-native.md) để customize thêm
- Đọc [Sử dụng nâng cao](./su-dung-nang-cao.md) để optimize workflow
- Check [Troubleshooting](./troubleshooting.md) nếu có issues

## 💡 Test Workflow Đầu Tiên

```bash
# Trong Claude Code session:

# 1. Plan
You: "/plan add Profile screen with user name and avatar"

# 2. Implement
You: "/cook implement profile screen"

# 3. Test
You: "Run tests and show results"

# 4. Commit
You: "/git:cm"
```

---

**Setup done in 30 seconds! 🎉**
