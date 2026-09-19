/**
 * ProductCard — displays one matched product recommendation: icon, name,
 * why it's recommended, and a "View on Amazon" button. No price shown —
 * the real product spreadsheet this catalog is built from has no price
 * data, so one is never guessed (see products.py).
 *
 * CHANGED (wrong photo bug): this used to load `product.image_url`, a
 * guessed Unsplash stock-photo URL — which is how a bathroom photo ended
 * up on a "drawer organizer" entry. There's no way to verify what an image
 * URL actually shows without fetching it, so the backend no longer sends
 * one; it sends a plain category `icon` instead (see products.py).
 * CHANGED (Amazon link wouldn't open): `Linking.canOpenURL()` is
 * unreliable for https links inside Expo Go — it can report a perfectly
 * valid link as unsupported. Now calls `openURL` directly and only alerts
 * on an actual thrown error.
 *
 * `product` shape (from backend /area/recommendations or
 * /projects/:id/products): { id, name, icon, amazon_link, reason,
 * dims_cm, quantity }
 */

import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Linking, Alert } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Icon from './Icon';

export default function ProductCard({ product }) {
  const quantity = product.quantity || 1;

  const openAmazon = async () => {
    try {
      await Linking.openURL(product.amazon_link);
    } catch (error) {
      console.error('❌ Failed to open Amazon link:', error);
      Alert.alert('Error', 'Something went wrong opening the link.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        {product.icon ? (
          <Text style={styles.icon}>{product.icon}</Text>
        ) : (
          <Icon name="box" size={32} color={Colors.icon} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {quantity > 1 ? `${quantity}× ` : ''}{product.name}
        </Text>

        <Text style={styles.reason} numberOfLines={3}>{product.reason}</Text>

        <TouchableOpacity style={styles.button} onPress={openAmazon} activeOpacity={0.8}>
          <Text style={styles.buttonText}>View on Amazon</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  iconBox: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  icon: {
    fontSize: 32,
  },
  body: {
    flex: 1,
    padding: 14,
  },
  name: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 4,
  },
  reason: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 17,
    marginBottom: 8,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginTop: 2,
  },
  buttonText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
  },
});
