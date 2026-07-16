/**
 * Room Selection Screen - Choose rooms to organize
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, Alert } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import { ROOM_TYPES } from '../constants/RoomConfig';

export default function RoomSelectionScreen({ goToScreen, updateData }) {
  const [selectedRooms, setSelectedRooms] = useState([]);

  const toggleRoom = (roomKey) => {
    if (selectedRooms.includes(roomKey)) {
      setSelectedRooms(selectedRooms.filter(r => r !== roomKey));
    } else {
      setSelectedRooms([...selectedRooms, roomKey]);
    }
  };

  const handleContinue = () => {
    if (selectedRooms.length === 0) {
      Alert.alert(
        'No Rooms Selected',
        'Please select at least one room to organize.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('✅ Selected rooms:', selectedRooms);
    updateData({ 
      selectedRooms, 
      currentRoomIndex: 0, 
      currentRoom: selectedRooms[0],
      roomPhotos: []
    });
    goToScreen('photoGuidance');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Rooms</Text>
          <Text style={styles.subtitle}>
            Choose which rooms you'd like to organize (up to 3)
          </Text>
        </View>

        <View style={styles.roomGrid}>
          {Object.entries(ROOM_TYPES).map(([key, room]) => {
            const isSelected = selectedRooms.includes(key);
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.roomCard,
                  isSelected && styles.roomCardSelected
                ]}
                onPress={() => toggleRoom(key)}
                activeOpacity={0.7}
              >
                <Text style={styles.roomIcon}>{room.icon}</Text>
                <View style={styles.roomInfo}>
                  <Text style={[
                    styles.roomName,
                    isSelected && styles.roomNameSelected
                  ]}>
                    {room.name}
                  </Text>
                  <Text style={styles.photoCount}>
                    {room.photoGuidance.length} photos
                  </Text>
                </View>
                {isSelected && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button 
          title={`Continue${selectedRooms.length > 0 ? ` (${selectedRooms.length} selected)` : ''}`}
          onPress={handleContinue}
          disabled={selectedRooms.length === 0}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: 30,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 36,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  roomGrid: {
    gap: 16,
  },
  roomCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  roomCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  roomIcon: {
    fontSize: 36,
    marginRight: 16,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  roomNameSelected: {
    color: Colors.accent,
  },
  photoCount: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});