import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.landlord.app',
  appName: 'Landlord',
  webDir: 'dist',
  android: {
    buildOptions: {
      keystorePath: 'release-key.keystore',
      keystorePassword: 'landlord',
      keystoreAlias: 'landlordkey',
      keystoreAliasPassword: 'landlord'
    }
  }
};

export default config;
