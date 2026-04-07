export type BillingType =
  | 'free'
  | 'pro'
  | 'team'
  | 'enterprise'
  | 'max'
  | string

export type SubscriptionType =
  | 'free'
  | 'pro'
  | 'team'
  | 'enterprise'
  | 'max'
  | string

export type RateLimitTier = string

export type OAuthTokenAccount = {
  uuid: string
  emailAddress: string
  organizationUuid?: string
}

export type OAuthProfileAccount = {
  uuid: string
  email?: string
  display_name?: string
  created_at?: string
  [key: string]: unknown
}

export type OAuthProfileOrganization = {
  uuid: string
  organization_type?: string
  has_extra_usage_enabled?: boolean
  billing_type?: BillingType
  subscription_created_at?: string
  rate_limit_tier?: RateLimitTier
  [key: string]: unknown
}

export type OAuthProfileResponse = {
  account?: OAuthProfileAccount
  organization?: OAuthProfileOrganization
  accountUuid?: string
  email?: string
  organizations?: unknown[]
  [key: string]: unknown
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  account?: {
    uuid: string
    email_address: string
    [key: string]: unknown
  }
  organization?: {
    uuid?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type OAuthTokens = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
  subscriptionType?: SubscriptionType | null
  rateLimitTier?: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: OAuthTokenAccount
  [key: string]: unknown
}

export type UserRolesResponse = {
  organization_role?: string
  workspace_role?: string
  organization_name?: string
  [key: string]: unknown
}

export type ReferralCampaign = 'claude_code_guest_pass' | string

export type ReferralCodeDetails = {
  referral_link?: string
  campaign?: ReferralCampaign
  [key: string]: unknown
}

export type ReferralEligibilityResponse = {
  eligible?: boolean
  reason?: string
  referral_code_details?: ReferralCodeDetails
  referrer_reward?: ReferrerRewardInfo | null
  remaining_passes?: number
  [key: string]: unknown
}

export type ReferralRedemptionsResponse = {
  redemptions?: unknown[]
  limit?: number
  [key: string]: unknown
}

export type ReferrerRewardInfo = {
  amount_minor_units: number
  currency: string
  [key: string]: unknown
}
