# Setup ClaudeKit cho React Native Project

## 📋 Yêu Cầu

```bash
# 1. Check Claude Code đã cài
claude --version

# 2. Check project React Native của bạn
cd /path/to/your-react-native-project
ls package.json  # Phải có file này
```

## 🚀 Setup Step-by-Step (10 phút)

### Bước 1: Backup project (phòng trường hợp có vấn đề)

```bash
# Trong project directory
cd ~/your-react-native-project

# Tạo backup
git status  # Check có uncommitted changes không
git add .
git commit -m "backup: before adding ClaudeKit"

# Hoặc nếu chưa dùng git:
cd ..
cp -r your-react-native-project your-react-native-project-backup
cd your-react-native-project
```

### Bước 2: Copy ClaudeKit files vào project

```bash
# Giả sử ClaudeKit source ở ~/Downloads/claudekit-engineer-main
CLAUDEKIT=~/Downloads/claudekit-engineer-main

# Copy core directories
cp -r $CLAUDEKIT/.claude .
cp -r $CLAUDEKIT/.opencode .

# Copy CLAUDE.md template
cp $CLAUDEKIT/CLAUDE.md .

# Tạo thư mục docs và plans
mkdir -p docs plans/reports plans/templates

# Copy doc templates
cp $CLAUDEKIT/docs/code-standards.md docs/
cp $CLAUDEKIT/docs/codebase-summary.md docs/

# Copy Vietnamese docs (optional)
cp -r $CLAUDEKIT/docs-vi docs-vi/
```

### Bước 3: Verify files đã copy

```bash
# Check structure
ls -la .claude/
ls -la .opencode/
ls CLAUDE.md
ls -la docs/
ls -la plans/

# Kết quả nên thấy:
# .claude/
#   ├── agents/
#   ├── commands/
#   ├── hooks/
#   ├── skills/
#   ├── workflows/
#   └── settings.json
#
# .opencode/
#   ├── agent/
#   └── command/
```

### Bước 4: Customize CLAUDE.md cho React Native

Mở file `CLAUDE.md` và thay thế nội dung bằng:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with this React Native project.

## Project Overview

[Tên app của bạn] - React Native mobile application
- Platform: iOS & Android
- Type: [E-commerce / Social / Productivity / ...]

## Tech Stack

### Mobile
- React Native: [version, check package.json]
- Navigation: React Navigation / Expo Router
- State Management: Redux / Zustand / Context API
- UI Library: React Native Paper / NativeBase / Custom

### Backend/API
- API: REST / GraphQL
- Base URL: [your API URL]
- Authentication: JWT / OAuth

### Development Tools
- Package Manager: npm / yarn / pnpm
- Build Tool: Expo / React Native CLI
- Testing: Jest / React Native Testing Library

## Essential Commands

### Development
\`\`\`bash
# Start Metro bundler
npm start

# Run on iOS
npm run ios
# Or: npx react-native run-ios

# Run on Android
npm run android
# Or: npx react-native run-android

# If using Expo
npx expo start
npx expo start --ios
npx expo start --android
\`\`\`

### Testing
\`\`\`bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
\`\`\`

### Build & Release
\`\`\`bash
# iOS build
npm run ios:release

# Android build
npm run android:release

# If using Expo
npx eas build --platform ios
npx eas build --platform android
\`\`\`

### Common Tasks
\`\`\`bash
# Install dependencies
npm install
# Or: yarn / pnpm install

# Clear cache
npm start -- --reset-cache

# Link native dependencies (if not using auto-linking)
npx react-native link

# Pods (iOS only)
cd ios && pod install && cd ..
\`\`\`

## Project Structure

\`\`\`
src/
├── components/        # Reusable components
│   ├── common/       # Button, Input, Card, etc.
│   └── specific/     # Feature-specific components
├── screens/          # Screen components
├── navigation/       # Navigation setup
├── services/         # API calls, storage
├── store/            # Redux/Zustand store
├── utils/            # Utility functions
├── hooks/            # Custom hooks
├── types/            # TypeScript types
├── constants/        # Constants, colors, sizes
└── assets/           # Images, fonts
\`\`\`

## React Native Conventions

### File Naming
- Components: PascalCase (UserProfile.tsx)
- Screens: PascalCase with Screen suffix (HomeScreen.tsx)
- Hooks: camelCase with use prefix (useAuth.ts)
- Utils: camelCase (formatDate.ts)

### Component Structure
\`\`\`typescript
// Functional component with TypeScript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  onPress?: () => void;
}

export const MyComponent: React.FC<Props> = ({ title, onPress }) => {
  return (
    <View style={styles.container}>
      <Text>{title}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});
\`\`\`

### Styling
- Use StyleSheet.create() for performance
- Common styles in constants/styles.ts
- Theme colors in constants/colors.ts
- Responsive: use Dimensions or react-native-size-matters

### Navigation
\`\`\`typescript
// Pattern for navigation prop
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Profile: { userId: string };
};

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Home'
>;
\`\`\`

### State Management
- Local state: useState for component state
- Global state: [Redux/Zustand/Context] for app state
- Async data: React Query / SWR (if using)

## Important Rules

### Performance
- Use React.memo() for expensive components
- Optimize FlatList with:
  - keyExtractor
  - getItemLayout (if fixed height)
  - removeClippedSubviews
  - maxToRenderPerBatch
- Lazy load images
- Avoid inline functions in renders

### Platform-Specific Code
\`\`\`typescript
import { Platform } from 'react-native';

// Platform select
const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      ios: { paddingTop: 20 },
      android: { paddingTop: 10 },
    }),
  },
});

// Platform check
if (Platform.OS === 'ios') {
  // iOS specific
}
\`\`\`

### Native Modules
- Link native dependencies: npx react-native link
- iOS: cd ios && pod install
- Android: Gradle sync automatic

### Testing
- Test components with @testing-library/react-native
- Mock navigation: import from @react-navigation/native
- Mock async storage: @react-native-async-storage/async-storage/jest
- Snapshot tests for UI components

## Common Patterns

### API Call Pattern
\`\`\`typescript
// src/services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

export const getUser = async (id: string) => {
  const response = await api.get(\`/users/\${id}\`);
  return response.data;
};
\`\`\`

### Custom Hook Pattern
\`\`\`typescript
// src/hooks/useUser.ts
import { useState, useEffect } from 'react';
import { getUser } from '../services/api';

export const useUser = (userId: string) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser(userId).then(setUser).finally(() => setLoading(false));
  }, [userId]);

  return { user, loading };
};
\`\`\`

## Development Workflow

### Adding New Feature
1. Create screen in src/screens/
2. Create components in src/components/
3. Add navigation route
4. Add API calls in src/services/
5. Update types in src/types/
6. Write tests
7. Test on both iOS and Android

### Debugging
\`\`\`bash
# React Native Debugger
npm install -g react-native-debugger

# Flipper (recommended)
# Install from: https://fbflipper.com/

# Chrome DevTools (for Expo)
Press 'j' in Expo terminal
\`\`\`

## Git Workflow

### .gitignore additions for React Native
\`\`\`
# Already in .gitignore typically:
node_modules/
ios/Pods/
ios/build/
android/app/build/
android/.gradle/

# Add these if not present:
.env
.env.local
*.jks
*.p8
*.p12
*.mobileprovision
\`\`\`

### Commit Message Format
Follow conventional commits:
- feat: new feature
- fix: bug fix
- refactor: code refactor
- style: UI/styling changes
- test: add tests
- docs: documentation
- chore: maintenance

## Troubleshooting

### Metro bundler issues
\`\`\`bash
# Clear cache and restart
npm start -- --reset-cache
rm -rf /tmp/metro-*
\`\`\`

### iOS build issues
\`\`\`bash
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
npm run ios
\`\`\`

### Android build issues
\`\`\`bash
cd android
./gradlew clean
cd ..
npm run android
\`\`\`

## Resources

- React Native Docs: https://reactnative.dev/
- React Navigation: https://reactnavigation.org/
- Expo Docs: https://docs.expo.dev/ (if using)
- Performance: https://reactnative.dev/docs/performance

---

**IMPORTANT**:
- Always test on both iOS and Android
- Follow React Native best practices
- Use TypeScript for type safety
- Write tests for critical flows
```

### Bước 5: Update development-rules.md cho React Native

```bash
# Edit file
nano .claude/workflows/development-rules.md
```

Thêm vào cuối file:

```markdown
## React Native Specific Rules

### Component Development
- Use functional components with hooks (no class components)
- Use TypeScript for all components
- Export named exports for better tree-shaking
- Memo expensive components

### Styling
- Use StyleSheet.create() for all styles
- Define styles at file bottom (not inline)
- Use theme colors from constants/colors.ts
- Responsive: use Dimensions or react-native-size-matters

### Performance
- FlatList for lists (not ScrollView with map)
- Optimize images (compress, use proper formats)
- Lazy load heavy components
- Use React.memo() for expensive renders

### Navigation
- Use React Navigation (not legacy Navigator)
- Type navigation props properly
- Centralize navigation in src/navigation/

### State Management
- Local state: useState
- Global state: [Redux/Zustand/Context API]
- Async data: React Query (if using)

### Testing
- Write tests for screens and components
- Use @testing-library/react-native
- Mock navigation and API calls
- Aim for >70% coverage

### Platform Differences
- Always test on both iOS and Android
- Use Platform.select() for platform-specific code
- Handle platform-specific UI/UX patterns

### Native Modules
- Document required native dependencies
- Include linking instructions
- Update iOS Podfile when needed
```

### Bước 6: Create React Native specific skill

```bash
# Create skill directory
mkdir -p .claude/skills/react-native-mobile
```

Create `.claude/skills/react-native-mobile/SKILL.md`:

```markdown
---
name: react-native-mobile
description: React Native mobile development patterns and best practices
---

## When to Use This Skill
- Building React Native mobile apps
- Implementing mobile-specific features
- Optimizing mobile performance
- Handling platform differences

## React Native Core Patterns

### Screen Component Template
\`\`\`typescript
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Home Screen</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
\`\`\`

### FlatList Optimization
\`\`\`typescript
<FlatList
  data={items}
  renderItem={({ item }) => <Item data={item} />}
  keyExtractor={(item) => item.id}
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
/>
\`\`\`

### Custom Hook for API
\`\`\`typescript
import { useState, useEffect } from 'react';

export const useFetch = <T,>(url: string) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
};
\`\`\`

## Mobile-Specific Considerations

### Image Optimization
- Use proper image formats (WebP on Android, optimized PNG/JPG)
- Provide multiple resolutions (@1x, @2x, @3x)
- Use FastImage for better performance
- Lazy load images

### Storage
- AsyncStorage for simple key-value
- MMKV for better performance
- Realm or WatermelonDB for complex data
- Secure sensitive data (react-native-keychain)

### Networking
- Handle offline scenarios
- Implement retry logic
- Show loading states
- Cache responses when appropriate

## Common Pitfalls

### DON'T
- Use ScrollView with .map() for long lists
- Define styles inline
- Use PNG for icons (use SVG)
- Ignore platform differences
- Skip testing on real devices

### DO
- Use FlatList for lists
- Use StyleSheet.create()
- Use react-native-svg for icons
- Test on both iOS and Android
- Test on real devices, not just emulators
```

### Bước 7: Make hooks executable

```bash
# Make hooks executable
chmod +x .claude/hooks/*.sh
chmod +x .claude/hooks/*.js

# Test hooks
node .claude/statusline.js
```

### Bước 8: Initialize git tracking (nếu chưa có)

```bash
# Nếu chưa dùng git
git init
git add .
git commit -m "feat: add ClaudeKit setup for React Native"

# Nếu đã có git
git add .claude .opencode CLAUDE.md docs docs-vi
git commit -m "feat: integrate ClaudeKit framework"
```

### Bước 9: Test ClaudeKit setup

```bash
# Start Claude Code trong project directory
claude

# Hoặc skip permissions để test nhanh
claude --dangerously-skip-permissions
```

## ✅ Verify Installation

Trong Claude Code session, test các commands:

```bash
# Test 1: Check commands available
You: "list available commands"

# Test 2: Analyze project
You: "Analyze this React Native project structure"

# Test 3: Create a simple plan
You: "/plan add a simple button component"

# Test 4: Check if skills work
You: "Create a new screen following React Native patterns"
```

## 🎯 First Real Task - Test Workflow

Giờ thử workflow thực tế:

```bash
# Task: Thêm một màn hình Profile đơn giản

You: "/plan add Profile screen with user avatar, name, and email display"

Claude:
1. Analyzes codebase structure
2. Creates detailed plan
3. Saves to ./plans/YYMMDD-HHMM-profile-screen/
4. Shows summary

You: "looks good, implement it"

You: "/cook implement the profile screen"

Claude:
1. Creates ProfileScreen.tsx in src/screens/
2. Adds navigation route
3. Creates any needed components
4. Adds TypeScript types
5. Creates styles
6. Tests on both platforms (mentions it)

You: "/test"

Claude:
- Runs npm test
- Reports results
- Fixes any issues

You: "/git:cm"

Claude:
- Creates commit: "feat: add profile screen with user info display"
- Commits changes
```

## 📱 React Native Specific Workflows

### Workflow 1: Add New Screen

```bash
You: "/plan add [ScreenName] screen with [features]"
# Claude creates plan following React Native patterns

You: "/cook implement [ScreenName]"
# Claude:
# - Creates screen component
# - Adds to navigation
# - Creates needed components
# - Adds types
# - Tests mention for both platforms
```

### Workflow 2: Add Feature to Existing Screen

```bash
You: "Add pull-to-refresh functionality to HomeScreen"

Claude:
# Uses react-native-mobile skill
# Implements RefreshControl
# Updates state management
# Tests functionality
```

### Workflow 3: Fix Platform-Specific Issue

```bash
You: "/fix button not showing correctly on Android"

Claude:
# Analyzes platform differences
# Fixes Android-specific styling
# Tests on both platforms
# Commits fix
```

### Workflow 4: Optimize Performance

```bash
You: "/plan optimize FlatList performance in ProductList screen"

Claude:
# Researches React Native performance best practices
# Creates optimization plan
# Implements:
#   - getItemLayout
#   - removeClippedSubviews
#   - windowSize optimization
#   - Memo expensive components
```

## 💡 Pro Tips cho React Native

### 1. Always Specify Platform Requirements

```bash
# Good
You: "Add image picker that works on both iOS and Android"

# Better
You: "Add image picker using react-native-image-picker,
     ensure permissions are handled for iOS (Info.plist)
     and Android (AndroidManifest.xml)"
```

### 2. Reference Existing Patterns

```bash
You: "Create ProductCard component similar to UserCard
     (src/components/UserCard.tsx) but for product data"
```

### 3. Mention Testing Platforms

```bash
You: "After implementing, provide instructions to test
     on both iOS simulator and Android emulator"
```

### 4. Specify Navigation Type

```bash
You: "Add Settings screen using React Navigation stack
     navigator, following patterns in src/navigation/AppNavigator.tsx"
```

## 🔧 Troubleshooting Setup

### Issue: Commands không work

```bash
# Check structure
ls -la .claude/commands/
# Should show nhiều .md files

# Restart Claude
exit
claude
```

### Issue: React Native skill không activate

```bash
# Check skill exists
ls -la .claude/skills/react-native-mobile/

# Explicitly activate
You: "Use react-native-mobile skill to create a screen"
```

### Issue: Metro bundler conflict

```bash
# Nếu Claude Code conflict với Metro bundler port
# Start Metro trên port khác
npm start -- --port 8082

# Hoặc stop Metro trước khi chạy Claude
# Ctrl+C trong terminal chạy Metro
```

## 📚 Next Steps

1. **Read Vietnamese docs**: `docs-vi/README.md`
2. **Test basic workflow**: Thử thêm 1 screen đơn giản
3. **Customize further**: Add project-specific commands
4. **Share with team**: Commit và share setup

## 🎓 Learning Resources

- [Quick Start](./docs-vi/quick-start.md)
- [Advanced Usage](./docs-vi/su-dung-nang-cao.md)
- [Troubleshooting](./docs-vi/troubleshooting.md)

---

**Setup done! Bắt đầu vibe coding React Native với ClaudeKit! 🚀📱**
