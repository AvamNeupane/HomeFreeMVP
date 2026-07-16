/**
 * Photo Card Component for displaying photo guidance
 * Supports both camera capture and gallery selection
 *
 * CHANGED (delete photos): a photo can now be removed outright (onDelete),
 * not just retaken. Retake and Delete are both shown as small pill buttons
 * over the image.
 */

import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';

export default function PhotoCard({ 
  photo, 
  guidance, 
  onTakePhoto,
  onChooseFromGallery,
  onDelete,
  index 
}) {
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

      {photo ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: photo }} style={styles.image} />
          <View style={styles.imageActions}>
            <TouchableOpacity 
              style={styles.retakeButton}
              onPress={onTakePhoto}
            >
              <Text style={styles.retakeText}>↻ Retake</Text>
            </TouchableOpacity>
            {onDelete && (
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={onDelete}
              >
                <Text style={styles.deleteText}>🗑 Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.cameraButton]}
            onPress={onTakePhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>📷</Text>
            <Text style={[styles.actionText, styles.cameraButtonText]}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.galleryButton]}
            onPress={onChooseFromGallery}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>🖼️</Text>
            <Text style={[styles.actionText, styles.galleryButtonText]}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
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
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: Colors.cardBackground,
  },
  imageActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
  },
  retakeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  retakeText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
  },
  deleteButton: {
    backgroundColor: 'rgba(192, 57, 43, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  deleteText: {
    color: Colors.white,
    fontSize: 12,
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