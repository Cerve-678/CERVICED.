import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

export default function AuthScreen({ navigation }: any) {
  const { login } = useAuth();
  const { theme } = useTheme();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });


  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const handleAuth = () => {
    if (isLogin) {
      console.log('Login:', { email, password });
      const userData = {
        email,
        name: 'User',
        isProvider: false,
        loginMethod: 'email'
      };
      login();
      navigation.navigate('Home');
    } else {
      console.log('Sign Up:', { name, email, password, confirmPassword });
      const userData = {
        name,
        email,
        isProvider: false,
        loginMethod: 'email'
      };
      login();
      navigation.navigate('Home');
    }
  };

  const handleSocialLogin = (provider: string) => {
    console.log(`${provider} login`);
    const userData = {
      name: `${provider} User`,
      email: `${provider.toLowerCase()}@user.com`,
      isProvider: false,
      loginMethod: provider.toLowerCase()
    };
    login();
    navigation.navigate('Home');
  };

  return (
    <ThemedBackground style={styles.background}>
      <StatusBar barStyle={theme.statusBar} translucent={true} />
      
      {/* Back Button */}
      <View style={styles.backButtonContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.backText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
      </View>
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>WELCOME TO</Text>
            <Text style={styles.subtitle}>CERVICED</Text>
          </View>

          {/* Toggle Buttons */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleButton, isLogin && styles.toggleActive]}
              onPress={() => setIsLogin(true)}
            >
              <BlurView
                intensity={isLogin ? 80 : 40}
                tint={theme.blurTint}
                style={styles.toggleBlur}
              >
                <Text style={[styles.toggleText, { color: isLogin ? theme.text : theme.secondaryText }]}>
                  LOG IN
                </Text>
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleButton, !isLogin && styles.toggleActive]}
              onPress={() => setIsLogin(false)}
            >
              <BlurView
                intensity={!isLogin ? 80 : 40}
                tint={theme.blurTint}
                style={styles.toggleBlur}
              >
                <Text style={[styles.toggleText, { color: !isLogin ? theme.text : theme.secondaryText }]}>
                  SIGN UP
                </Text>
              </BlurView>
            </TouchableOpacity>
          </View>

          {/* Main Card */}
          <BlurView intensity={40} tint={theme.blurTint} style={styles.mainCard}>
            <View style={styles.cardContent}>
              {/* Form Fields */}
              {!isLogin && (
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: theme.text }]}>NAME</Text>
                  <BlurView intensity={30} tint={theme.blurTint} style={styles.inputBlur}>
                    <TextInput
                      style={[styles.textInput, { color: theme.text }]}
                      value={name}
                      onChangeText={setName}
                      placeholder="SARAH JOHNSON"
                      placeholderTextColor={theme.secondaryText}
                    />
                  </BlurView>
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.text }]}>EMAIL</Text>
                <BlurView intensity={30} tint={theme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="JOHN@EXAMPLE.COM"
                    placeholderTextColor={theme.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </BlurView>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.text }]}>PASSWORD</Text>
                <BlurView intensity={30} tint={theme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••••"
                    placeholderTextColor={theme.secondaryText}
                    secureTextEntry
                  />
                </BlurView>
              </View>

              {!isLogin && (
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: theme.text }]}>CONFIRM PASSWORD</Text>
                  <BlurView intensity={30} tint={theme.blurTint} style={styles.inputBlur}>
                    <TextInput
                      style={[styles.textInput, { color: theme.text }]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="••••••••••"
                      placeholderTextColor={theme.secondaryText}
                      secureTextEntry
                    />
                  </BlurView>
                </View>
              )}

              {/* Main Action Button */}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleAuth}
              >
                <BlurView intensity={60} tint={theme.blurTint} style={styles.actionButtonBlur}>
                  <Text style={[styles.actionButtonText, { color: theme.text }]}>
                    {isLogin ? 'LOG IN' : 'CREATE ACCOUNT'}
                  </Text>
                </BlurView>
              </TouchableOpacity>

              {/* Forgot Password (Login only) */}
              {isLogin && (
                <TouchableOpacity style={styles.forgotPassword}>
                  <Text style={[styles.forgotPasswordText, { color: theme.text }]}>Forgot Password?</Text>
                </TouchableOpacity>
              )}

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={[styles.dividerText, { color: theme.secondaryText }]}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Login Options */}
              <View style={styles.socialContainer}>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialLogin('Instagram')}
                >
                  <BlurView intensity={50} tint={theme.blurTint} style={styles.socialBlur}>
                    <Text style={[styles.socialText, { color: theme.text }]}>Instagram</Text>
                  </BlurView>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialLogin('Google')}
                >
                  <BlurView intensity={50} tint={theme.blurTint} style={styles.socialBlur}>
                    <Text style={[styles.socialText, { color: theme.text }]}>Google</Text>
                  </BlurView>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialLogin('Apple')}
                >
                  <BlurView intensity={50} tint={theme.blurTint} style={styles.socialBlur}>
                    <Text style={[styles.socialText, { color: theme.text }]}>Apple</Text>
                  </BlurView>
                </TouchableOpacity>
              </View>

              {/* Terms & Privacy (Sign Up only) */}
              {!isLogin && (
                <Text style={[styles.termsText, { color: theme.secondaryText }]}>
                  By signing up, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              )}
            </View>
          </BlurView>

          {/* Provider Sign Up Link */}
          <TouchableOpacity
            style={styles.providerLink}
            onPress={() => console.log('Provider signup')}
          >
            <Text style={[styles.providerLinkText, { color: theme.text }]}>
              Are you a beauty professional? <Text style={styles.providerLinkBold}>Sign up as a provider</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
  },
  backButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  backText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 120,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 24,
    color: '#000',
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 36,
    color: '#DA70D6',
    textAlign: 'center',
    letterSpacing: 2,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
    gap: 15,
  },
  toggleButton: {
    borderRadius: 25,
    overflow: 'hidden',
    flex: 1,
    maxWidth: 150,
  },
  toggleBlur: {
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 25,
  },
  toggleActive: {
    // Active state handled by blur intensity
  },
  toggleText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    letterSpacing: 1,
  },
  toggleTextActive: {
    color: '#000',
  },
  mainCard: {
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 20,
  },
  cardContent: {
    padding: 25,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#000',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputBlur: {
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  textInput: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: '#000',
    letterSpacing: 0.5,
  },
  actionButton: {
    borderRadius: 25,
    overflow: 'hidden',
    marginTop: 10,
  },
  actionButtonBlur: {
    backgroundColor: 'rgba(218, 112, 214, 0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(218, 112, 214, 0.5)',
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: '#000',
    letterSpacing: 1,
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 15,
  },
  forgotPasswordText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: '#000',
    textDecorationLine: 'underline',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dividerText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
    marginHorizontal: 15,
    letterSpacing: 1,
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  socialButton: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
  },
  socialBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 15,
    paddingVertical: 12,
    alignItems: 'center',
  },
  socialText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
  },
  termsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 20,
  },
  termsLink: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  providerLink: {
    alignItems: 'center',
    marginTop: 15,
  },
  providerLinkText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: '#000',
    textAlign: 'center',
  },
  providerLinkBold: {
    fontFamily: 'BakbakOne-Regular',
    color: '#DA70D6',
  },
  loading: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
});