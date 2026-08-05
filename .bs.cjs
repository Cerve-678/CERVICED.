globalThis.__DEV__=false;const M=require('module'),o=M._resolveFilename;
const S=/^(react-native|react-native-get-random-values|@react-native-async-storage\/async-storage|expo-.*|expo|@expo\/.*)$/;
M._resolveFilename=function(r,...a){if(S.test(r)||r.includes('lib/supabase')||r.includes('largeSecureStore'))return require.resolve('./.be.cjs');return o.call(this,r,...a);};
