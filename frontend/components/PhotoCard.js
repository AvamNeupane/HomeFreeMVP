/**
 * Photo Card Component for displaying photo guidance
 * Supports both camera capture and gallery selection
 *
 * CHANGED (multi-photo categories): a category used to hold exactly one
 * photo — taking a new one silently replaced the old one. `photos` is now
 * an array, so a category like "Seating Area" can hold as many shots as
 * the user wants (a wide shot plus a couple of close-ups), each removable
 * on its own instead of the whole category being all-or-nothing.
 */

import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Icon from './Icon';

export default function PhotoCard({
  photos,
  guidance,
  onTakePhoto,
  onChooseFromGallery,
  onDeletePhoto,
  index
}) {
  const photoList = photos || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{guidance.icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{guidance.title}</Text>
          <Text style={styles.description}>{guidance.description}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
        </View>
      </View>

      {photoList.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow} contentContainerStyle={styles.thumbRowContent}>
          {photoList.map((uri, i) => (
            <View key={uri + i} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <TouchableOpacity style={styles.thumbDelete} onPress={() => onDeletePhoto(uri)}>
                <Icon name="close" size={11} color={Colors.white} strokeWidth={12} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.cameraButton]}
          onPress={onTakePhoto}
          activeOpacity={0.8}
        >
          <Icon name="camera" size={22} color={Colors.white} style={styles.actionIcon} />
          <Text style={[styles.actionText, styles.cameraButtonText]}>
            {photoList.length > 0 ? 'Add Another Photo' : 'Take Photo'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.galleryButton]}
          onPress={onChooseFromGallery}
          activeOpacity={0.8}
        >
          <Icon name="gallery" size={22} color={Colors.textPrimary} style={styles.actionIcon} />
          <Text style={[styles.actionText, styles.galleryButtonText]}>Choose from Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
  },
  thumbRow: {
    marginBottom: 12,
  },
  thumbRowContent: {
    gap: 10,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: Colors.cardBackground,
  },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDeleteText: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
  },
  buttonContainer: {
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
  },
  cameraButton: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  galleryButton: {
    backgroundColor: Colors.white,
    borderColor: Colors.border,
  },
  actionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  actionText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
  },
  cameraButtonText: {
    color: Colors.white,
  },
  galleryButtonText: {
    color: Colors.textPrimary,
  },
});
