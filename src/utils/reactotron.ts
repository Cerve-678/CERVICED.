import Reactotron from 'reactotron-react-native';

if (__DEV__) {
  Reactotron
    .configure({
      name: 'MyApp',
      host: 'localhost', // Change to your computer's IP if using physical device
    })
    .useReactNative({
      asyncStorage: false, // We're using AsyncStorage differently
      networking: {
        ignoreUrls: /symbolicate|logs/, // Ignore Metro bundler noise
      },
      editor: false, // Set to true if you want editor integration
      errors: { veto: (stackFrame) => false }, // Don't ignore any errors
      overlay: false, // Disable overlay - can be annoying during video playback
    })
    .connect();

  // Clear Reactotron on each app load during development
  Reactotron.clear();

  if (__DEV__) console.log('Reactotron Configured');
}

export default Reactotron;