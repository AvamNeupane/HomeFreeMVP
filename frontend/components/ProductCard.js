/**
 * ProductCard — displays one matched product recommendation:
 * image, name, price, why it's recommended, and a "View on Amazon" button
 * with the affiliate link attached.
 *
 * Usage: <ProductCard product={product} />
 * `product` shape (from backend /area/recommendations or /projects/:id/products):
 *   { id, name, price, image_url, amazon_link, reason, fit_note }
 */

import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Linking, Alert } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';

export default function ProductCard({ product }) {
  const openAmazon = async () => {
    try {
      const supported = await Linking.canOpenURL(product.amazon_link);
      if (supported) {
        await Linking.openURL(product.amazon_link);
      } else {
        Alert.alert('Unable to Open', 'Could not open the Amazon link.');
      }
    } catch (error) {
      console.error('❌ Failed to open Amazon link:', error);
      Alert.alert('Error', 'Something went wrong opening the link.');
    }
  };

  return (
    <View style={styles.card}>
      <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="cover" />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        </View>

        <Text style={styles.reason}>{product.reason}</Text>

        {product.fit_note && (
          <Text style={styles.fitNote}>{product.fit_note}</Text>
        )}

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
    marginBottom: 14,
    overflow: 'hidden',
  },
  image: {
    width: 100,
    height: '100%',
    minHeight: 130,
    backgroundColor: Colors.cardBackground,
  },
  body: {
    flex: 1,
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginRight: 8,
  },
  price: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  reason: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 19,
    marginBottom: 6,
  },
  fitNote: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 4,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
  },
});