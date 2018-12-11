package gjkr

import (
	"fmt"
	"math/big"

	"github.com/keep-network/keep-core/pkg/net/ephemeral"
)

// EphemeralPublicKeyMessage is a message payload that carries the sender's
// ephemeral public key generated specifically for the given receiver.
//
// The receiver performs ECDH on a sender's ephemeral public key and on the
// receiver's private ephemeral key, creating a symmetric key used for encrypting
// a conversation between a sender and receiver. In case of an accusation for
// malicious behavior, the accusing party reveals its private ephemeral key so
// that all the other group members can resolve the accusation looking at
// messages exchanged between accuser and accused party. To validate correctness
// of accuser's private ephemeral key, all group members must know its ephemeral
// public key prior to exchanging any messages. Hence, why the ephemeral public
// key of the party is broadcast to the group.
type EphemeralPublicKeyMessage struct {
	senderID   MemberID // i
	receiverID MemberID // j

	ephemeralPublicKey *ephemeral.PublicKey // Y_ij
}

// MemberCommitmentsMessage is a message payload that carries the sender's
// commitments to polynomial coefficients during distributed key generation.
//
// It is expected to be broadcast.
type MemberCommitmentsMessage struct {
	senderID MemberID

	commitments []*big.Int // slice of `C_ik`
}

// PeerSharesMessage is a message payload that carries shares `s_ij` and `t_ij`
// calculated by the sender `i` for the recipient `j` during distributed key
// generation.
//
// It is expected to be communicated in an encrypted fashion to the selected
// recipient.
type PeerSharesMessage struct {
	senderID   MemberID // i
	receiverID MemberID // j

	encryptedShareS []byte // s_ij
	encryptedShareT []byte // t_ij
}

func newPeerSharesMessage(
	senderID, receiverID MemberID,
	shareS, shareT *big.Int,
	symmetricKey ephemeral.SymmetricKey,
) (*PeerSharesMessage, error) {
	encryptedS, err := symmetricKey.Encrypt(shareS.Bytes())
	if err != nil {
		return nil, fmt.Errorf("could not create PeerSharesMessage [%v]", err)
	}

	encryptedT, err := symmetricKey.Encrypt(shareT.Bytes())
	if err != nil {
		return nil, fmt.Errorf("could not create PeerSharesMessage [%v]", err)
	}

	return &PeerSharesMessage{senderID, receiverID, encryptedS, encryptedT}, nil
}

func (psm *PeerSharesMessage) decryptShareS(key ephemeral.SymmetricKey) (*big.Int, error) {
	decryptedS, err := key.Decrypt(psm.encryptedShareS)
	if err != nil {
		return nil, fmt.Errorf("could not decrypt S share [%v]", err)
	}

	return new(big.Int).SetBytes(decryptedS), nil
}

func (psm *PeerSharesMessage) decryptShareT(key ephemeral.SymmetricKey) (*big.Int, error) {
	decryptedT, err := key.Decrypt(psm.encryptedShareT)
	if err != nil {
		return nil, fmt.Errorf("could not evaluate T share [%v]", err)
	}

	return new(big.Int).SetBytes(decryptedT), nil
}

// CanDecrypt checks if the PeerSharesMessage can be successfully decrypted
// with the provided key. This function should be called before the message
// is passed to DKG protocol for processing. It's possible that malicious
// group member can send an invalid message. In such case, it should be rejected
// to do not cause a failure in DKG protocol.
func (psm *PeerSharesMessage) CanDecrypt(key ephemeral.SymmetricKey) bool {
	if _, err := psm.decryptShareS(key); err != nil {
		return false
	}
	if _, err := psm.decryptShareT(key); err != nil {
		return false
	}

	return true
}

// SecretSharesAccusationsMessage is a message payload that carries all of the
// sender's accusations against other members of the threshold group.
// If all other members behaved honestly from the sender's point of view, this
// message should be broadcast but with an empty map of `accusedMembersKeys`.
//
// It is expected to be broadcast.
type SecretSharesAccusationsMessage struct {
	senderID MemberID

	accusedMembersKeys map[MemberID]*ephemeral.PrivateKey
}

// MemberPublicKeySharePointsMessage is a message payload that carries the sender's
// public key share points.
// It is expected to be broadcast.
type MemberPublicKeySharePointsMessage struct {
	senderID MemberID

	publicKeySharePoints []*big.Int // A_ik = g^{a_ik} mod p
}

// PointsAccusationsMessage is a message payload that carries all of the sender's
// accusations against other members of the threshold group after public key share
// points validation.
// If all other members behaved honestly from the sender's point of view, this
// message should be broadcast but with an empty map of `accusedMembersKeys`.
// It is expected to be broadcast.
type PointsAccusationsMessage struct {
	senderID MemberID

	accusedMembersKeys map[MemberID]*ephemeral.PrivateKey
}

// DisqualifiedMembersKeysMessage is a message payload that carries sender's
// ephemeral private keys used to generate ephemeral symmetric keys to encrypt
// communication with members disqualified when points accusations were resolved.
// It is expected to be broadcast.
type DisqualifiedMembersKeysMessage struct {
	senderID MemberID

	disqualifiedMembersKeys map[MemberID]*ephemeral.PrivateKey
}
