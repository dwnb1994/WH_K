import { Tabs } from 'expo-router'
import { FontAwesome6 } from '@expo/vector-icons'
import { Platform } from 'react-native'

const BLUE = '#2563EB'
const GREY = '#94A3B8'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: GREY,
        tabBarStyle: {
          borderTopColor: '#E2E8F0',
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#0F172A',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'หน้าหลัก',
          tabBarIcon: ({ color }) => <FontAwesome6 name="house" color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'สแกน',
          tabBarIcon: ({ color }) => <FontAwesome6 name="barcode" color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: 'รับเข้า',
          tabBarIcon: ({ color }) => <FontAwesome6 name="file-import" color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="dispatch"
        options={{
          title: 'เบิก',
          tabBarIcon: ({ color }) => <FontAwesome6 name="arrow-up-from-bracket" color={color} size={20} />,
        }}
      />
    </Tabs>
  )
}
