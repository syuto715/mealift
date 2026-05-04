// Ambient module shims for native packages declared in package.json but
// not yet `npm install`-ed in this checkout. The shims keep `tsc --noEmit`
// clean during the code-prep phase; once the real package lands, the
// real types in node_modules take precedence over these declarations.
//
// Remove a shim block here as soon as `npm install <package>` has been
// run AND the import resolves against the real types.

declare module 'expo-apple-authentication' {
  import type { ComponentType } from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';

  export enum AppleAuthenticationButtonType {
    SIGN_IN = 0,
    CONTINUE = 1,
    SIGN_UP = 2,
  }

  export enum AppleAuthenticationButtonStyle {
    WHITE = 0,
    WHITE_OUTLINE = 1,
    BLACK = 2,
  }

  export enum AppleAuthenticationScope {
    FULL_NAME = 0,
    EMAIL = 1,
  }

  export interface AppleAuthenticationFullName {
    namePrefix: string | null;
    givenName: string | null;
    middleName: string | null;
    familyName: string | null;
    nameSuffix: string | null;
    nickname: string | null;
  }

  export interface AppleAuthenticationCredential {
    user: string;
    state: string | null;
    fullName: AppleAuthenticationFullName | null;
    email: string | null;
    realUserStatus: number;
    identityToken: string | null;
    authorizationCode: string | null;
  }

  export interface AppleAuthenticationSignInOptions {
    requestedScopes?: AppleAuthenticationScope[];
    state?: string;
    nonce?: string;
  }

  export function signInAsync(
    options?: AppleAuthenticationSignInOptions,
  ): Promise<AppleAuthenticationCredential>;

  export function isAvailableAsync(): Promise<boolean>;

  export interface AppleAuthenticationButtonProps {
    onPress: () => void;
    buttonType: AppleAuthenticationButtonType;
    buttonStyle: AppleAuthenticationButtonStyle;
    cornerRadius?: number;
    style?: StyleProp<ViewStyle>;
  }

  export const AppleAuthenticationButton: ComponentType<AppleAuthenticationButtonProps>;
}
