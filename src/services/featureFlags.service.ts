import { globalFeatureConfig } from '../../backend/features';

export interface FeatureFlag {
  enabled: boolean;
  label: string;
  description: string;
}

export type FeatureFlags = Record<string, FeatureFlag>;

export const featureFlagsService = {
  async getGlobalFlags(): Promise<FeatureFlags> {
    return globalFeatureConfig;
  },

  async isEnabled(featureId: string): Promise<boolean> {
    const features = await this.getGlobalFlags();
    const feature = features[featureId];
    if (!feature || typeof feature.enabled !== 'boolean') {
      throw new Error(`Feature configuration is missing for "${featureId}"`);
    }
    return feature.enabled;
  },
};
