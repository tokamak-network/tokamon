export interface User {
  address: string;
  totalSteps: number;
  totalTokensEarned: number;
  totalSpotsCreated: number;
  totalSpotsCollected: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStats {
  todaySteps: number;
  todayTokens: number;
  weeklySteps: number;
  weeklyTokens: number;
  monthlySteps: number;
  monthlyTokens: number;
}

export interface UserProfile {
  address: string;
  displayName?: string;
  avatar?: string;
  stats: UserStats;
}
