import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderInboxScreen from '../../../screens/provider/ProviderInboxScreen';
import ProviderConversationScreen from '../../../screens/provider/ProviderConversationScreen';
import { LinkOnlyMessagesStackParamList } from '../../types';

const Stack = createNativeStackNavigator<LinkOnlyMessagesStackParamList>();

/** Link-only providers' Messages tab — the same inbox and conversations every
 *  provider has (see ProviderTabNavigator). */
export default function LinkOnlyMessagesNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProviderInbox" component={ProviderInboxScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ProviderConversation"
        component={ProviderConversationScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
    </Stack.Navigator>
  );
}
